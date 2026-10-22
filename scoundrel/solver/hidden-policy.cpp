// Hidden-deck Monte Carlo tree search. The process receives only public belief
// states, never a shuffle seed, the initial deck, or the actual unseen order.
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <limits>
#include <string>
#include <unordered_map>
#include <vector>
using namespace std;

struct State {
  array<uint8_t,44> u{}, b{};
  array<uint8_t,4> r{};
  int un=0, bn=0, rn=0, h=20, w=0, l=15, p=0, f=0, g=0;
};
struct Next { State s; bool terminal=false; int score=0; };
struct Action { int move, n=0; double prior=0, sum=0, squares=0; bool exact=false; };
struct Node { vector<Action> actions; int n=0; };
struct Random {
  uint32_t x;
  double next() { x^=x<<13; x^=x>>17; x^=x<<5; return double(x)/4294967296.0; }
};
int value(int c) { return c&15; }
int type(int c) { return c>>4; }
int remaining(const State&s) { return s.un+s.bn+s.rn; }
string key(const State&s) {
  string k;
  for(int i=0;i<s.un;i++)k.push_back(s.u[i]); k.push_back('/');
  for(int i=0;i<s.bn;i++)k.push_back(s.b[i]); k.push_back('/');
  auto room=s.r; if(!s.f)sort(room.begin(),room.begin()+s.rn);
  for(int i=0;i<s.rn;i++)k.push_back(room[i]); k.push_back('/');
  for(int n:{s.h,s.w,s.l,s.p,s.f,s.g}){ k+=to_string(n); k.push_back(','); }
  return k;
}
vector<int> moves(const State&s) {
  if(s.g)return {130};
  vector<int> result; uint64_t seen=0;
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
  sort(result.begin(),result.end()); return result;
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
    vector<int>costs;int healing=0,weapon=s.w;
    for(int i=0;i<s.rn;i++) {
      int c=s.r[i],v=value(c),t=type(c);
      costs.push_back(t?0:s.w&&v<s.l?max(0,v-s.w):v);
      if(t==2)healing=max(healing,min(v,20-s.h));
      if(t==1)weapon=max(weapon,v);
    }
    sort(costs.begin(),costs.end());int cost=0;for(int i=0;i<min(3,int(costs.size()));i++)cost+=costs[i];
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
struct Plan {int move=-1;double value=-numeric_limits<double>::infinity();};
// This cache contains only visible-room features and can be shared across jobs.
unordered_map<uint64_t,Plan> plans;
struct Room { array<uint8_t,4> r;int rn,h,w,l,p; };
Plan roomPlan(Room s,bool hasDeck) {
  auto sorted=s.r;sort(sorted.begin(),sorted.begin()+s.rn);
  uint64_t k=(uint64_t(s.h)<<24)|(uint64_t(s.w)<<29)|(uint64_t(s.l)<<33)|(uint64_t(s.p)<<37)|(uint64_t(hasDeck)<<38);
  for(int i=0;i<s.rn;i++)k|=uint64_t(sorted[i])<<(6*i);
  auto it=plans.find(k);if(it!=plans.end())return it->second;
  array<int,8> choices{};int count=0;uint64_t seen=0;
  for(int i=0;i<s.rn;i++) {
    int c=s.r[i];if(seen&(uint64_t(1)<<c))continue;seen|=uint64_t(1)<<c;
    choices[count++]=c;if(type(c)==0&&s.w&&value(c)<s.l)choices[count++]=c|64;
  }
  sort(choices.begin(),choices.begin()+count);
  Plan best;
  for(int j=0;j<count;j++) {
    int move=choices[j];Room n=s;int c=move&63,v=value(c),t=type(c),index=0;
    while(n.r[index]!=c)index++;
    for(int i=index+1;i<n.rn;i++)n.r[i-1]=n.r[i];n.rn--;
    if(t==1){n.w=v;n.l=15;}
    else if(t==2){if(!n.p)n.h=min(20,n.h+v);n.p=1;}
    else{n.h-=move&64?max(0,v-n.w):v;if(move&64)n.l=v;}
    double utility;
    if(n.h<=0){int damage=0;for(int i=0;i<n.rn;i++)if(type(n.r[i])==0)damage+=value(n.r[i]);utility=-10000+n.h-damage;}
    else if(!n.rn)utility=n.h+(n.h==20&&t==2?v:0);
    else if(n.rn==1&&hasDeck) {
      double power=n.w*(n.l-2)/13.0;int carry=n.r[0],rank=value(carry);
      double item=type(carry)==2?rank*.55:type(carry)==1?max(0.0,rank-power)*.7:-max(0,rank-(n.w&&rank<n.l?n.w:0))*.7;
      utility=n.h-pow(max(0,7-n.h),2)*.5+power*1.3+item;
    }else utility=roomPlan(n,hasDeck).value;
    if(utility>best.value+1e-9){best.value=utility;best.move=move;}
  }
  if(plans.size()>2000000)plans.clear();plans.emplace(k,best);return best;
}
struct Search {
  Random rng;
  unordered_map<string,Node> tree;
  unordered_map<string,int> endgames;
  uint64_t skips=0;
  explicit Search(uint32_t seed):rng{seed?seed:1}{}
  bool canFinish(const State&s){return !s.un&&remaining(s)<=8;}
  int known(const State&s) {
    string k=key(s);auto it=endgames.find(k);if(it!=endgames.end())return it->second;
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
    for(auto&a:node.actions)floor=max(floor,mean(a)-(a.exact?0:2.5*uncertainty(a)));
    int winner=-1;double high=-numeric_limits<double>::infinity();
    for(int i=0;i<int(node.actions.size());i++) {
      auto&a=node.actions[i];
      if(a.n>=(root?48:12)&&!a.exact&&mean(a)+2.5*uncertainty(a)<floor){skips++;continue;}
      double rank=a.exact?mean(a):mean(a)+65*sqrt(log(node.n+2.0)/a.n)+a.prior/(a.n+1);
      if(rank>high+1e-9){high=rank;winner=i;}
    }
    return winner;
  }
  int rollout(State s) {
    while(true) {
      if(!s.un&&remaining(s)<=4)return known(s);
      Plan plan=s.g?Plan{130,0}:roomPlan(Room{s.r,s.rn,s.h,s.w,s.l,s.p},s.un||s.bn);
      double current=s.h-pow(max(0,7-s.h),2)*.5+s.w*(s.l-2)/13.0*1.3;
      int move=s.f&&plan.value<current-7-1e-9?128:plan.move;
      auto n=step(s,move,rng);if(n.terminal)return n.score;s=n.s;
    }
  }
  vector<Action> run(const State&initial,int iterations) {
    string rootKey=key(initial);tree.emplace(rootKey,makeNode(initial));
    bool complete=true;for(auto&a:tree.at(rootKey).actions)complete&=a.exact;
    if(complete)return tree.at(rootKey).actions;
    for(int iteration=0;iteration<iterations;iteration++) {
      State s=initial;int score;vector<pair<Node*,int>>path;
      for(int depth=0;;depth++) {
        string k=key(s);auto it=tree.find(k);
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
