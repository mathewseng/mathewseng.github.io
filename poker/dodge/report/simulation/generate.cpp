// Reproducible Dodge simulation. No third-party dependencies.
// clang++ -O3 -std=c++17 -pthread generate.cpp -o /tmp/dodge-sim
// /tmp/dodge-sim --self-test
// /tmp/dodge-sim 100000 12 ../data/hands.json
#include <algorithm>
#include <array>
#include <atomic>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

constexpr uint64_t SEED = 2026091901ULL;
constexpr int BINS = 13, CATEGORIES = 6;
// Card IDs sort A to 2, then spades, hearts, diamonds, clubs.
std::array<uint8_t, 8192> straights{}, popcounts{};
void init() {
  for (int m = 0; m < 8192; ++m) {
    popcounts[m] = __builtin_popcount(static_cast<unsigned>(m));
    if ((m & 0x100f) == 0x100f) straights[m] = 5;
    for (int top = 4; top < 13; ++top)
      if ((m & (31 << (top - 4))) == (31 << (top - 4))) straights[m] = top + 2;
  }
}
struct State {
  uint16_t suits[4] = {}, one = 0, two = 0, three = 0, four = 0;
  int n = 0;
  void add(int c) {
    uint16_t b = 1 << (12 - c / 4);
    suits[c % 4] |= b;
    four |= three & b; three |= two & b; two |= one & b; one |= b; ++n;
  }
  // Highest five-card category, royal flush split out of straight flush.
  int bust() const {
    if (n < 5) return -1;
    bool flush = false;
    int sf = 0;
    for (auto m : suits) {
      if (popcounts[m] >= 5) { flush = true; sf = std::max(sf, int(straights[m])); }
    }
    if (sf) return sf == 14 ? 5 : 4;
    if (four) return 3;
    if (three && popcounts[two] >= 2) return 2;
    if (flush) return 1;
    return straights[one] ? 0 : -1;
  }
};
struct RNG {
  uint64_t state;
  static uint64_t mix(uint64_t z) {
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
  }
  uint32_t next() { return uint32_t(mix(state += 0x9e3779b97f4a7c15ULL) >> 32); }
  int card() { // Rejection removes modulo bias; rejecting used cards samples without replacement.
    uint32_t x;
    do { x = next(); } while (x < uint32_t(-52u) % 52u);
    return x % 52u;
  }
};
struct Hand {
  std::array<int,4> cards;
  int multiplicity = 0, exact1 = 0, exact2 = 0;
  std::array<uint32_t, BINS * CATEGORIES> joint{};
};
std::array<int,4> canonical(std::array<int,4> cards) {
  std::array<int,4> masks{}, order{0,1,2,3}, remap{};
  for (int c : cards) masks[c % 4] |= 1 << (12 - c / 4);
  std::sort(order.begin(), order.end(), [&](int a, int b) {
    if (popcounts[masks[a]] != popcounts[masks[b]]) return popcounts[masks[a]] > popcounts[masks[b]];
    return masks[a] > masks[b];
  });
  for (int i = 0; i < 4; ++i) remap[order[i]] = i;
  for (int &c : cards) c = (c / 4) * 4 + remap[c % 4];
  std::sort(cards.begin(), cards.end());
  return cards;
}
std::vector<Hand> enumerate() {
  std::map<std::array<int,4>, Hand> classes;
  for (int a=0;a<49;++a) for(int b=a+1;b<50;++b)
    for(int c=b+1;c<51;++c) for(int d=c+1;d<52;++d) {
      auto key = canonical({a,b,c,d});
      auto &h = classes[key]; h.cards = key; ++h.multiplicity;
    }
  std::vector<Hand> hands;
  int total = 0;
  for (auto &entry : classes) { hands.push_back(entry.second); total += entry.second.multiplicity; }
  if (hands.size() != 16432 || total != 270725) throw std::runtime_error("Isomorphism enumeration failed");
  return hands;
}
void simulate(Hand &h, int trials, size_t index) {
  State initial;
  uint64_t used = 0;
  std::vector<int> deck;
  for (int c : h.cards) { initial.add(c); used |= 1ULL << c; }
  for (int c=0;c<52;++c) if (!(used & (1ULL<<c))) deck.push_back(c);
  for (int c : deck) { auto s=initial; s.add(c); h.exact1 += s.bust() >= 0; }
  // Bust is monotone as cards accumulate, so unordered two-card endpoints give exact P(T <= 2).
  for (int a=0;a<48;++a) for(int b=a+1;b<48;++b) {
    auto s=initial; s.add(deck[a]); s.add(deck[b]); h.exact2 += s.bust() >= 0;
  }
  // Hash class seeds before using them as states. Raw consecutive SplitMix states
  // would reuse shifted copies of the SAME stream and correlate different classes.
  RNG rng{RNG::mix(SEED + 0x9e3779b97f4a7c15ULL * (index + 1))};
  for (int trial=0; trial<trials; ++trial) {
    State s = initial;
    uint64_t drawn = used;
    for (int t=0;t<BINS;++t) {
      int c;
      do { c = rng.card(); } while (drawn & (1ULL << c));
      drawn |= 1ULL << c; s.add(c);
      int outcome = s.bust();
      if (outcome >= 0) { ++h.joint[t*CATEGORIES+outcome]; break; }
      if (t == BINS-1) throw std::runtime_error("A 17-card hand must contain a flush");
    }
  }
}
void selfTest() {
  // An exhaustive independent combinatorial check against standard five-card category counts.
  std::array<uint64_t,7> counts{};
  for(int a=0;a<48;++a) for(int b=a+1;b<49;++b) for(int c=b+1;c<50;++c)
    for(int d=c+1;d<51;++d) for(int e=d+1;e<52;++e) {
      State s; for(int x : {a,b,c,d,e}) s.add(x); ++counts[s.bust()+1];
    }
  const std::array<uint64_t,7> expected{2579244,10200,5108,3744,624,36,4};
  if (counts != expected) throw std::runtime_error("Five-card exhaustive validation failed");
  State doubleTrips; for(int c : {0,1,2,4,5,6}) doubleTrips.add(c);
  if (doubleTrips.bust()!=2) throw std::runtime_error("Two trips must be a full house");
  State quads; for(int c : {0,1,2,3}) quads.add(c);
  if (quads.bust()!=-1) throw std::runtime_error("Need five cards to bust");
  quads.add(4); if(quads.bust()!=3) throw std::runtime_error("Quad bust failed");
  auto hands=enumerate();
  for (const auto &h : hands) {
    if (canonical(h.cards) != h.cards) throw std::runtime_error("Noncanonical hand");
    std::array<int,4> p{0,1,2,3};
    do {
      auto cards=h.cards; for(int &c : cards) c=(c/4)*4+p[c%4];
      if (canonical(cards)!=h.cards) throw std::runtime_error("Suit permutation mismatch");
    } while (std::next_permutation(p.begin(),p.end()));
  }
  std::cout << "PASS: all 2,598,960 five-card hands; all 16,432 suit classes and 24 permutations; 270,725 deals; boundary cases.\n";
}
int main(int argc,char**argv) {
  try {
    init();
    if (argc>1 && std::string(argv[1])=="--self-test") { selfTest(); return 0; }
    int trials = argc>1 ? std::stoi(argv[1]) : 100000;
    int workers = argc>2 ? std::stoi(argv[2]) : 8;
    std::string path = argc>3 ? argv[3] : "../data/hands.json";
    if(trials<2 || workers<1 || workers>64) throw std::runtime_error("Invalid trial/thread count");
    auto started=std::chrono::steady_clock::now();
    auto hands=enumerate();
    std::atomic<size_t> cursor{0}, completed{0};
    std::vector<std::thread> threads;
    for(int w=0;w<workers;++w) threads.emplace_back([&]{
      size_t i;
      while((i=cursor.fetch_add(1))<hands.size()) {
        simulate(hands[i],trials,i);
        size_t done=completed.fetch_add(1)+1;
        if(done%2000==0) std::cerr<<done<<" / "<<hands.size()<<" hands\n";
      }
    });
    for(auto &t:threads)t.join();
    double seconds=std::chrono::duration<double>(std::chrono::steady_clock::now()-started).count();
    std::ofstream out(path);
    if(!out) throw std::runtime_error("Cannot open output");
    auto now=std::time(nullptr); auto utc=*std::gmtime(&now);
    out<<"{\"schemaVersion\":1,\"generatedAt\":\""<<std::put_time(&utc,"%Y-%m-%dT%H:%M:%SZ")
       <<"\",\"seed\":"<<SEED<<",\"rng\":\"splitmix64-hashed-class-streams-v1\",\"trialsPerHand\":"<<trials<<",\"totalTrials\":"<<uint64_t(trials)*hands.size()
       <<",\"classCount\":16432,\"dealCount\":270725,\"maxDraws\":13,\"elapsedSeconds\":"<<seconds
       <<",\"categories\":[\"Straight\",\"Flush\",\"Full house\",\"Four of a kind\",\"Straight flush\",\"Royal flush\"],"
       <<"\"columns\":[\"cards\",\"combinations\",\"exactFirstBustOuts\",\"exactBustByTwoCombinations\",\"jointDrawCategoryCounts\"],\"hands\":[\n";
    for(size_t i=0;i<hands.size();++i) {
      const auto &h=hands[i];
      if(std::accumulate(h.joint.begin(),h.joint.end(),uint64_t(0))!=uint64_t(trials)) throw std::runtime_error("Missing trials");
      out<<"[["<<h.cards[0]<<","<<h.cards[1]<<","<<h.cards[2]<<","<<h.cards[3]<<"],"<<h.multiplicity<<","<<h.exact1<<","<<h.exact2<<",[";
      for(size_t j=0;j<h.joint.size();++j) {if(j)out<<",";out<<h.joint[j];}
      out<<"]]"<<(i+1<hands.size()?",\n":"\n");
    }
    out<<"]}\n";
    std::cout<<"Wrote "<<hands.size()<<" hands, "<<uint64_t(trials)*hands.size()<<" trials in "<<seconds<<" seconds to "<<path<<"\n";
  } catch(const std::exception &e) { std::cerr<<e.what()<<"\n"; return 1; }
}
