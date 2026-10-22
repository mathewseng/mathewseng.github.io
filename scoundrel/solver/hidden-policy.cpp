// Hidden-deck Monte Carlo tree search. The process receives only public belief
// states, never a shuffle seed, the initial deck, or the actual unseen order.
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <iomanip>
#include <iostream>
#include <limits>
#include <string>
#include <unordered_map>
#include <vector>
using namespace std;
// std::sort's general dispatch is costly for these 2–10 element buffers.
template<class T> void sortSmall(T* begin,T* end) {
  for(T* i=begin+1;i<end;i++){T v=*i;T* j=i;while(j>begin&&v<j[-1]){*j=j[-1];--j;}*j=v;}
}

struct State {
  array<uint8_t,44> u{}, b{};
  array<uint8_t,4> r{};
  int un=0, bn=0, rn=0, h=20, w=0, l=15, p=0, f=0, g=0;
};
struct Next { State s; bool terminal=false; int score=0; };
struct Action { int move, n=0; double prior=0, sum=0, squares=0; bool exact=false; };
// Fixed action/path buffers remove allocations from every simulation.
template<class T,int Capacity> struct SmallList {
  array<T,Capacity> items{}; int count=0;
  T* begin(){return items.data();} T* end(){return items.data()+count;}
  const T* begin()const{return items.data();} const T* end()const{return items.data()+count;}
  void push_back(const T&x){items[count++]=x;}
  size_t size()const{return count;}
  T& operator[](size_t i){return items[i];}
  const T& operator[](size_t i)const{return items[i];}
};
using Actions=SmallList<Action,10>;
struct Node { Actions actions; int n=0; };
struct Random {
  uint32_t x;
  double next() { x^=x<<13; x^=x>>17; x^=x<<5; return double(x)/4294967296.0; }
};
int value(int c) { return c&15; }
int type(int c) { return c>>4; }
int remaining(const State&s) { return s.un+s.bn+s.rn; }
// Exact canonical bytes: table hash collisions are checked with full equality.
// Remaining cards occupy at most 44 bytes; metadata distinguishes each queue.
struct Key {
  array<uint8_t,56> bytes{};
  bool operator==(const Key&o)const{return bytes==o.bytes;}
};
uint64_t mix(uint64_t x){x^=x>>30;x*=0xbf58476d1ce4e5b9ULL;x^=x>>27;x*=0x94d049bb133111ebULL;return x^(x>>31);}
struct KeyHash {
  size_t operator()(const Key&k)const{
    uint64_t hash=0x9e3779b97f4a7c15ULL;
    for(int i=0;i<7;i++){uint64_t word;memcpy(&word,k.bytes.data()+8*i,8);hash=mix(hash^word);}
    return hash;
  }
};
Key key(const State&s) {
  Key k;int pos=0;
  memcpy(k.bytes.data()+pos,s.u.data(),s.un);pos+=s.un;
  memcpy(k.bytes.data()+pos,s.b.data(),s.bn);pos+=s.bn;
  auto room=s.r;if(!s.f)sortSmall(room.data(),room.data()+s.rn);
  memcpy(k.bytes.data()+pos,room.data(),s.rn);
  k.bytes[44]=s.un;k.bytes[45]=s.bn;k.bytes[46]=s.rn;
  k.bytes[47]=s.h;k.bytes[48]=s.w;k.bytes[49]=s.l;
  k.bytes[50]=s.p;k.bytes[51]=s.f;k.bytes[52]=s.g;
  return k;
}
SmallList<int,10> moves(const State&s) {
  SmallList<int,10> result;
  if(s.g){result.push_back(130);return result;}
  uint64_t seen=0;
  for(int i=0;i<s.rn;i++) {
    int c=s.r[i]; if(seen&(uint64_t(1)<<c))continue; seen|=uint64_t(1)<<c;
    result.push_back(c);
    if(type(c)==0&&s.w&&value(c)<s.l)result.push_back(c|64);
  }
  if(s.f) {
    result.push_back(128); bool distinct=false;
    for(int i=0;i<s.rn;i++)distinct|=s.r[i]!=s.r[s.rn-1-i];
    if(distinct)result.push_back(129);
  }
  sortSmall(result.begin(),result.end()); return result;
}
int damageLeft(const State&s) {
  int sum=0;
  for(int i=0;i<s.un;i++)if(type(s.u[i])==0)sum+=value(s.u[i]);
  for(int i=0;i<s.bn;i++)if(type(s.b[i])==0)sum+=value(s.b[i]);
  for(int i=0;i<s.rn;i++)if(type(s.r[i])==0)sum+=value(s.r[i]);
  return sum;
}
Next step(const State&s,int move,Random&rng,bool deterministic=false) {
  Next out;out.s=s;auto&n=out.s;
  auto draw=[&](){
    while(n.rn<4&&(n.un||n.bn)) {
      if(n.un) {
        int i=deterministic?0:int(rng.next()*n.un); n.r[n.rn++]=n.u[i];
        for(int j=i+1;j<n.un;j++)n.u[j-1]=n.u[j]; n.un--;
      } else {
        n.r[n.rn++]=n.b[0]; for(int j=1;j<n.bn;j++)n.b[j-1]=n.b[j]; n.bn--;
      }
    }
  };
  if(move>=128) {
    if(move!=130) {
      for(int i=0;i<s.rn;i++)n.b[n.bn++]=s.r[move==129?s.rn-1-i:i];
      n.rn=0;
    }
    draw();n.p=0;n.g=0;n.f=move==130&&n.rn==4;return out;
  }
  int c=move&63,v=value(c),t=type(c),index=0;
  while(n.r[index]!=c)index++;
  for(int i=index+1;i<n.rn;i++)n.r[i-1]=n.r[i]; n.rn--;n.f=0;
  if(t==1){n.w=v;n.l=15;}
  else if(t==2){if(!n.p)n.h=min(20,n.h+v);n.p=1;}
  else{n.h-=move&64?max(0,v-n.w):v;if(move&64)n.l=v;}
  if(n.h<=0){out.terminal=true;out.score=n.h-damageLeft(n);return out;}
  if(!remaining(n)){out.terminal=true;out.score=n.h+(n.h==20&&t==2?v:0);return out;}
  if(n.rn==1&&(n.un||n.bn)){draw();n.p=0;n.f=n.rn==4;}
  return out;
}
double preference(const State&s,int move) {
  if(move==130)return 0;
  if(move>=128) {
    SmallList<int,4>costs;int healing=0,weapon=s.w;
    for(int i=0;i<s.rn;i++) {
      int c=s.r[i],v=value(c),t=type(c);
      costs.push_back(t?0:s.w&&v<s.l?max(0,v-s.w):v);
      if(t==2)healing=max(healing,min(v,20-s.h));
      if(t==1)weapon=max(weapon,v);
    }
    sortSmall(costs.begin(),costs.end());int cost=0;for(int i=0;i<min(3,int(costs.size()));i++)cost+=costs[i];
    return -4+cost*1.3-healing*.8-(weapon-s.w)*1.5;
  }
  int c=move&63,v=value(c),t=type(c);
  if(t==1)return (v-s.w*(s.l-2)/13.0)*2+3;
  if(t==2)return s.p?-12:min(v,20-s.h)*1.7-v*.55;
  int damage=move&64?max(0,v-s.w):v;
  return (move&64?4+v*.4-(s.l-v)/13.0*min(s.w,6):0)-damage*2.5-(damage>=s.h?500:0);
}
double mean(const Action&a){return a.sum/a.n;}
double uncertainty(const Action&a){return a.exact?0:a.n<2?numeric_limits<double>::infinity():sqrt(max(0.0,a.squares/a.n-mean(a)*mean(a))/a.n);}
struct Plan {int move=-1;double value=-numeric_limits<double>::infinity();uint64_t finish=0;};
// This cache contains only visible-room features and can be shared across jobs.
// Bounded direct-mapped memo table. Eviction changes speed only, never a plan.
struct PlanEntry { uint64_t tagged=0; double value=0; uint64_t finish=0; };
constexpr uint64_t planKeyMask=(1ULL<<40)-1;
constexpr size_t planCapacity=1<<22;
vector<PlanEntry> plans(planCapacity);
// The visible-room policy has a finite state space. A collision-free combinadic
// index lets every process reuse these deterministic plans through one sparse
// memory-mapped file (~4 GiB address space; pages are filled only when visited).
// Both 64-bit fields are atomic: simultaneous writers compute identical values.
struct MemoEntry { uint64_t valueBits, packed; };
MemoEntry* sharedPlans=nullptr;
constexpr size_t featureCount=20*127*2;
constexpr size_t roomCounts[]={0,0,496,5456,46376};
constexpr size_t memoCount=(496+5456+46376)*featureCount;
uint32_t combinations[35][5]{};
void initSharedPlans(){
  for(int n=0;n<35;n++){combinations[n][0]=1;for(int k=1;k<5;k++)combinations[n][k]=n?combinations[n-1][k]+combinations[n-1][k-1]:0;}
  const char* path=getenv("SCOUNDREL_PLAN_CACHE");if(!path||!*path)return;
  int fd=open(path,O_CREAT|O_RDWR,0600);if(fd<0)return;
  struct stat status{};size_t bytes=memoCount*sizeof(MemoEntry);
  if(fstat(fd,&status)||((size_t)status.st_size!=bytes&&ftruncate(fd,bytes))){close(fd);return;}
  void* mapped=mmap(nullptr,bytes,PROT_READ|PROT_WRITE,MAP_SHARED,fd,0);close(fd);
  if(mapped!=MAP_FAILED)sharedPlans=static_cast<MemoEntry*>(mapped);
}
MemoEntry* memoEntry(const array<uint8_t,4>&room,int rn,int h,int w,int l,int p){
  size_t rank=0,offset=0;
  for(int i=0;i<rn;i++){int c=room[i],v=type(c)==0?value(c)-2:type(c)==1?value(c)+11:value(c)+20;rank+=combinations[v+i][i+1];}
  for(int n=2;n<rn;n++)offset+=roomCounts[n];
  int weapon=w?1+(w-2)*14+l-2:0;
  return sharedPlans+(offset+rank)*featureCount+((h-1)*127+weapon)*2+p;
}
struct Room { array<uint8_t,4> r;int rn,h,w,l,p; };
uint64_t packRoom(const Room&s){
  uint64_t k=uint64_t(s.h+16)<<24|uint64_t(s.w)<<30|uint64_t(s.l)<<34|uint64_t(s.p)<<38|uint64_t(s.rn)<<39;
  for(int i=0;i<s.rn;i++)k|=uint64_t(s.r[i])<<(6*i);
  return k;
}
void applyRoom(State&s,uint64_t k){
  s.h=int((k>>24)&63)-16;s.w=(k>>30)&15;s.l=(k>>34)&15;s.p=(k>>38)&1;s.rn=(k>>39)&7;s.f=0;
  for(int i=0;i<s.rn;i++)s.r[i]=(k>>(6*i))&63;
}
double carryUtilities[21][11][16][43];
double currentUtilities[21][11][16];
void initUtilities(){
  for(int h=1;h<=20;h++)for(int w=0;w<=10;w++)for(int l=2;l<=15;l++){
    double power=w*(l-2)/13.0;
    double current=h-pow(max(0,7-h),2)*.5+power*1.3;
    currentUtilities[h][w][l]=current;
    for(int c=2;c<=42;c++){
      int rank=value(c);
      double item=type(c)==2?rank*.55:type(c)==1?max(0.0,rank-power)*.7:-max(0,rank-(w&&rank<l?w:0))*.7;
      carryUtilities[h][w][l][c]=current+item;
    }
  }
}
Plan roomPlan(Room s,bool hasDeck) {
  auto sorted=s.r;sortSmall(sorted.data(),sorted.data()+s.rn);
  uint64_t k=(uint64_t(s.h)<<24)|(uint64_t(s.w)<<29)|(uint64_t(s.l)<<33)|(uint64_t(s.p)<<37)|(uint64_t(hasDeck)<<38);
  for(int i=0;i<s.rn;i++)k|=uint64_t(sorted[i])<<(6*i);
  MemoEntry* shared=sharedPlans&&hasDeck&&s.rn>=2?memoEntry(sorted,s.rn,s.h,s.w,s.l,s.p):nullptr;
  if(shared){
    uint64_t packed=__atomic_load_n(&shared->packed,__ATOMIC_ACQUIRE);
    if(packed){uint64_t bits=__atomic_load_n(&shared->valueBits,__ATOMIC_RELAXED);double utility;memcpy(&utility,&bits,8);return Plan{int((packed>>48)&255),utility,packed&((1ULL<<48)-1)};}
  }
  auto &entry=plans[mix(k)&(planCapacity-1)];
  if(!shared&&(entry.tagged&planKeyMask)==k)return Plan{int(entry.tagged>>40),entry.value,entry.finish};
  array<int,8> choices{};int count=0;uint64_t seen=0;
  for(int i=0;i<s.rn;i++) {
    int c=s.r[i];if(seen&(uint64_t(1)<<c))continue;seen|=uint64_t(1)<<c;
    choices[count++]=c;if(type(c)==0&&s.w&&value(c)<s.l)choices[count++]=c|64;
  }
  sortSmall(choices.data(),choices.data()+count);
  Plan best;
  for(int j=0;j<count;j++) {
    int move=choices[j];Room n=s;int c=move&63,v=value(c),t=type(c),index=0;
    while(n.r[index]!=c)index++;
    for(int i=index+1;i<n.rn;i++)n.r[i-1]=n.r[i];n.rn--;
    if(t==1){n.w=v;n.l=15;}
    else if(t==2){if(!n.p)n.h=min(20,n.h+v);n.p=1;}
    else{n.h-=move&64?max(0,v-n.w):v;if(move&64)n.l=v;}
    double utility;uint64_t finish=0;
    if(n.h<=0){int damage=0;for(int i=0;i<n.rn;i++)if(type(n.r[i])==0)damage+=value(n.r[i]);utility=-10000+n.h-damage;}
    else if(!n.rn)utility=n.h+(n.h==20&&t==2?v:0);
    else if(n.rn==1&&hasDeck) {
      utility=carryUtilities[n.h][n.w][n.l][n.r[0]];
    }else {auto tail=roomPlan(n,hasDeck);utility=tail.value;finish=tail.finish;}
    if(utility>best.value+1e-9){best.value=utility;best.move=move;best.finish=finish?finish:packRoom(n);}
  }
  if(shared){
    uint64_t bits;memcpy(&bits,&best.value,8);__atomic_store_n(&shared->valueBits,bits,__ATOMIC_RELAXED);
    __atomic_store_n(&shared->packed,best.finish|(uint64_t(best.move)<<48)|(1ULL<<63),__ATOMIC_RELEASE);
  }else entry={k|(uint64_t(best.move)<<40),best.value,best.finish};
  return best;
}
struct Search {
  Random rng;
  unordered_map<Key,Node,KeyHash> tree;
  unordered_map<Key,int,KeyHash> endgames;
  uint64_t skips=0;
  explicit Search(uint32_t seed):rng{seed?seed:1}{tree.reserve(4096);endgames.reserve(1024);}
  bool canFinish(const State&s){return !s.un&&remaining(s)<=8;}
  int known(const State&s) {
    Key k=key(s);auto it=endgames.find(k);if(it!=endgames.end())return it->second;
    int best=numeric_limits<int>::min();
    for(int m:moves(s)){auto n=step(s,m,rng);best=max(best,n.terminal?n.score:known(n.s));}
    endgames.emplace(std::move(k),best);return best;
  }
  Node makeNode(const State&s) {
    Node node;
    for(int m:moves(s)) {
      Action a;a.move=m;a.prior=preference(s,m);
      auto n=step(s,m,rng,true);
      if(n.terminal||canFinish(s)){double score=n.terminal?n.score:known(n.s);a.n=1;a.sum=score;a.squares=score*score;a.exact=true;}
      node.actions.push_back(a);
    }
    return node;
  }
  int choose(const Node&node,bool root) {
    int initial=-1;
    for(int i=0;i<int(node.actions.size());i++) {
      auto&a=node.actions[i];
      if(a.n==0&&(initial<0||a.prior>node.actions[initial].prior+1e-9))initial=i;
    }
    if(initial>=0)return initial;
    if(root) {
      for(int i=0;i<int(node.actions.size());i++) {
        auto&a=node.actions[i];if(a.exact||a.n>=48)continue;
        if(initial<0||a.n<node.actions[initial].n||(a.n==node.actions[initial].n&&a.prior>node.actions[initial].prior+1e-9))initial=i;
      }
      if(initial>=0)return initial;
    }
    double floor=-numeric_limits<double>::infinity();
    array<double,10> averages{}, errors{};
    for(int i=0;i<int(node.actions.size());i++) {
      const auto&a=node.actions[i];averages[i]=mean(a);errors[i]=2.5*uncertainty(a);
      floor=max(floor,averages[i]-errors[i]);
    }
    const double logVisits=log(node.n+2.0);
    int winner=-1;double high=-numeric_limits<double>::infinity();
    for(int i=0;i<int(node.actions.size());i++) {
      auto&a=node.actions[i];
      if(a.n>=(root?48:12)&&!a.exact&&averages[i]+errors[i]<floor){skips++;continue;}
      double rank=a.exact?mean(a):averages[i]+65*sqrt(logVisits/a.n)+a.prior/(a.n+1);
      if(rank>high+1e-9){high=rank;winner=i;}
    }
    return winner;
  }
  int rollout(State s) {
    while(true) {
      if(!s.un&&remaining(s)<=4)return known(s);
      Plan plan=s.g?Plan{130,0}:roomPlan(Room{s.r,s.rn,s.h,s.w,s.l,s.p},s.un||s.bn);
      double current=currentUtilities[s.h][s.w][s.l];
      int move=s.f&&plan.value<current-7-1e-9?128:plan.move;
      // The cached visible-room plan also stores its deterministic final state.
      // Jump to that boundary, then sample new cards. No future draw is exposed.
      if(move<128&&(s.un||s.bn)&&(s.un||remaining(s)>s.rn+2)){
        applyRoom(s,plan.finish);
        if(s.h<=0)return s.h-damageLeft(s);
        move=130;
      }
      auto n=step(s,move,rng);if(n.terminal)return n.score;s=n.s;
    }
  }
  Actions run(const State&initial,int iterations) {
    Key rootKey=key(initial);tree.emplace(rootKey,makeNode(initial));
    bool complete=true;for(auto&a:tree.at(rootKey).actions)complete&=a.exact;
    if(complete)return tree.at(rootKey).actions;
    for(int iteration=0;iteration<iterations;iteration++) {
      State s=initial;int score;SmallList<pair<Node*,int>,10>path;
      for(int depth=0;;depth++) {
        Key k=key(s);auto it=tree.find(k);
        if(it==tree.end()||depth>=9) {
          if(it==tree.end()&&tree.size()<12000)tree.emplace(k,makeNode(s));
          score=rollout(s);break;
        }
        Node&node=it->second;int index=choose(node,k==rootKey);auto&a=node.actions[index];path.push_back({&node,index});
        if(a.exact){score=int(mean(a));break;}
        auto n=step(s,a.move,rng);if(n.terminal){score=n.score;break;}s=n.s;
      }
      // unordered_map rehash preserves references to its stored nodes.
      for(auto [node,index]:path){node->n++;auto&a=node->actions[index];if(!a.exact){a.n++;a.sum+=score;a.squares+=double(score)*score;}}
    }
    return tree.at(rootKey).actions;
  }
};
int main() {
  initUtilities();initSharedPlans();
  ios::sync_with_stdio(false);cin.tie(nullptr);cout<<setprecision(15);
  int iterations;uint32_t seed;
  while(cin>>iterations>>seed) {
    State s;cin>>s.h>>s.w>>s.l>>s.p>>s.f>>s.g>>s.rn;
    if(!cin||s.rn<1||s.rn>4||iterations<1)return 2;
    for(int i=0,c;i<s.rn;i++){cin>>c;s.r[i]=c;}
    cin>>s.un;if(s.un<0||s.un>40)return 2;for(int i=0,c;i<s.un;i++){cin>>c;s.u[i]=c;}
    cin>>s.bn;if(s.bn<0||s.bn>44||s.bn+s.un+s.rn>44)return 2;for(int i=0,c;i<s.bn;i++){cin>>c;s.b[i]=c;}
    if(!cin)return 2;
    auto started=chrono::steady_clock::now();Search search(seed);auto actions=search.run(s,iterations);
    cout<<"{\"actions\":[";
    for(size_t i=0;i<actions.size();i++) {
      auto&a=actions[i];if(i)cout<<",";
      cout<<"{\"move\":"<<a.move<<",\"score\":"<<mean(a)<<",\"samples\":"<<a.n<<",\"exact\":"<<(a.exact?"true":"false")<<",\"standardError\":"<<(isfinite(uncertainty(a))?uncertainty(a):0)<<"}";
    }
    cout<<"],\"heuristicSkips\":"<<search.skips<<",\"elapsed\":"<<chrono::duration_cast<chrono::milliseconds>(chrono::steady_clock::now()-started).count()<<"}"<<endl;
  }
}
