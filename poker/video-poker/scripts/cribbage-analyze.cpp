// c++ -O3 -std=c++17 cribbage-analyze.cpp -o /tmp/cribbage-analyze
// Deterministic sampled initial deals, EXACT conditional draws for every hold.
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <unordered_map>
#include <vector>
using namespace std;
using Hist=array<double,128>;
double C[53][8]; int pc[16]; unordered_map<uint64_t,int> rankCache;
int N, cap=7,held[14],avail[14],takeN[14],counts[14]; Hist hist;
int rankScore(){
 uint64_t key=0;for(int r=1;r<=13;r++)key=key*5+counts[r];
 auto it=rankCache.find(key);if(it!=rankCache.end())return it->second;
 int ways[16]={1},score=0;
 for(int r=1;r<=13;r++){score+=counts[r]*(counts[r]-1);for(int c=0;c<counts[r];c++)for(int v=15;v>=min(r,10);v--)ways[v]+=ways[v-min(r,10)];}
 score+=2*ways[15];int runs=0;
 for(int len=cap;len>=3&&!runs;len--)for(int start=1;start<=14-len;start++){int mult=1;for(int r=start;r<start+len;r++)mult*=counts[r];runs+=len*mult;}
 return rankCache[key]=score+runs;
}
void suits(int points){
 const int j=counts[11];
 for(int jm=avail[11];;jm=(jm-1)&avail[11]){
  if(pc[jm]==takeN[11]){
   int jack=jm|held[11];
   for(int absent=jack;;absent=(absent-1)&jack){
    int b=pc[absent];double ways=1;
    for(int r=1;r<=13&&ways;r++)if(r!=11){if(held[r]&absent){ways=0;break;}ways*=C[pc[avail[r]&~absent]][takeN[r]];}
    if(ways){
     for(int k=0;k<=b;k++)hist[points+j-k]+=((b-k)%2?-1:1)*C[b][k]*ways;
     for(int s=0;s<4;s++){
      int bit=1<<s;if(absent&bit)continue;
      int fixed=(jack&bit)?1:0,possible=0;
      for(int r=1;r<=13;r++)if(r!=11){if(held[r]&bit)fixed++;if(takeN[r]&&(avail[r]&bit))possible++;}
      if(fixed+possible<4)continue;
      double poly[8]={1};int degree=0;
      for(int r=1;r<=13;r++)if(r!=11&&takeN[r]){
       int allowed=avail[r]&~absent,q=takeN[r],has=(allowed&bit)?1:0,other=pc[allowed]-has;
       double a=C[other][q],z=has?C[other][q-1]:0;
       for(int k=min(N,degree+1);k>=0;k--)poly[k]=poly[k]*a+(k?poly[k-1]*z:0);
       degree++;
      }
      for(int f=max(0,4-fixed);f<=degree&&f+fixed<=N;f++)if(poly[f])for(int k=0;k<=b;k++){
       double w=((b-k)%2?-1:1)*C[b][k]*poly[f];hist[points+j-k+min(cap,f+fixed)]+=w;hist[points+j-k]-=w;
      }
     }
    }
    if(!absent)break;
   }
  }
  if(!jm)break;
 }
}
void visit(int r,int left){
 if(r==14){if(!left)suits(rankScore());return;}
 int fixed=pc[held[r]],mx=min(left,pc[avail[r]]);
 for(int q=0;q<=mx;q++){counts[r]=fixed+q;takeN[r]=q;visit(r+1,left-q);}
 counts[r]=fixed;takeN[r]=0;
}
Hist distribution(const vector<int>& h,int mask){
 fill(held,held+14,0);fill(avail,avail+14,15);fill(counts,counts+14,0);fill(takeN,takeN+14,0);hist.fill(0);int kept=0;
 for(int i=0;i<N;i++){int r=h[i]/4+2;if(r==14)r=1;int bit=1<<(h[i]%4);avail[r]&=~bit;if(mask&(1<<i)){held[r]|=bit;counts[r]++;kept++;}}
 visit(1,N-kept);double denom=C[52-N][N-kept];for(auto& x:hist)x/=denom;return hist;
}
struct Stats {double sum=0,sq=0,sumStake=0,sumStakeSq=0,sumCross=0;long doubled=0,ties=0;void add(double net,bool useDouble,bool tie){double st=useDouble?2:1;sum+=net;sq+=net*net;sumStake+=st;sumStakeSq+=st*st;sumCross+=net*st;doubled+=useDouble;ties+=tie;}};
int main(int argc,char** argv){
 for(int n=0;n<=52;n++){C[n][0]=1;for(int k=1;k<=7;k++)C[n][k]=n?C[n-1][k]+C[n-1][k-1]:0;}for(int i=0;i<16;i++)pc[i]=__builtin_popcount(i);
 N=argc>1?atoi(argv[1]):4;int samples=argc>2?atoi(argv[2]):128;uint32_t seed=argc>3?strtoul(argv[3],nullptr,10):4729;int lo=argc>4?atoi(argv[4]):0,hi=argc>5?atoi(argv[5]):50;
 if(N<4||N>7||samples<1||lo<0||hi>100||hi<lo)return 1;
 // Additional card IDs emit all exact gross EVs at fee=lo for cross-language validation.
 bool one=argc>6;vector<int> fixed;if(one)for(int i=6;i<argc;i++)fixed.push_back(atoi(argv[i]));if(one&&fixed.size()!=N)return 2;
 vector<array<Stats,2>> stats(hi+1);
 for(int sample=0;sample<(one?1:samples);sample++){
  vector<int> deck(52);for(int i=0;i<52;i++)deck[i]=i;
  for(int i=51;i>0;i--){seed=1664525u*seed+1013904223u;int j=int((double(seed)/4294967296.0)*(i+1));swap(deck[i],deck[j]);}
  vector<int> h=one?fixed:vector<int>(deck.begin(),deck.begin()+N);vector<double> best(hi+1,-1e300),bestDouble(hi+1,-1e300);
  for(int mask=0;mask<(1<<N);mask++){
   auto dist=distribution(h,mask);double prob=0;for(double p:dist){if(p<-1e-10){cerr<<"Negative probability";return 3;}prob+=p;}if(abs(prob-1)>1e-9){cerr<<"Unnormalized "<<prob;return 4;}
   for(int fee=lo;fee<=hi;fee++){
    double ev=0;for(int score=fee+1;score<128;score++)ev+=dist[score]*(score-fee);
    best[fee]=max(best[fee],ev-1);if(mask!=(1<<N)-1)bestDouble[fee]=max(bestDouble[fee],2*(ev-1));
    if(one&&fee==lo)cout<<mask<<" "<<setprecision(16)<<ev<<"\n";
   }
  }
  if(!one)for(int fee=lo;fee<=hi;fee++){stats[fee][0].add(best[fee],false,false);bool use=bestDouble[fee]>best[fee]+1e-10,tie=abs(bestDouble[fee]-best[fee])<=1e-10;stats[fee][1].add(use?bestDouble[fee]:best[fee],use,tie);}
  if(!one&&(sample+1)%32==0)cerr<<N<<" cards: "<<sample+1<<"/"<<samples<<"\n";
 }
 if(one)return 0;
 cout<<"[";bool first=true;
 for(int fee=lo;fee<=hi;fee++)for(int mode=0;mode<2;mode++){
  auto s=stats[fee][mode];double net=s.sum/samples,stake=s.sumStake/samples,ratio=net/stake;
  double residual=s.sq-2*ratio*s.sumCross+ratio*ratio*s.sumStakeSq;
  double se=sqrt(max(0.0,residual/(samples-1)/samples))/stake;
  if(!first)cout<<",";first=false;
  cout<<setprecision(16)<<"{\"fee\":"<<fee<<",\"doubleOnDraw\":"<<(mode?"true":"false")<<",\"result\":{\"rtp\":"<<1+ratio<<",\"netEV\":"<<net<<",\"expectedReturn\":"<<net+stake<<",\"averageStake\":"<<stake<<",\"deals\":"<<samples<<",\"doubleCount\":"<<s.doubled<<",\"doubleFrequency\":"<<double(s.doubled)/samples<<",\"doubleTieCount\":"<<s.ties<<",\"doubleTieFrequency\":"<<double(s.ties)/samples<<",\"rtpSE\":"<<se<<",\"estimated\":true}}";
 }
 cout<<"]\n";
}
