// Linear points-minus-fee analysis. Reuses the independently tested rank scorer.
#define main capped_analysis_main
#include "cribbage-analyze.cpp"
#undef main

double rankExpectation(int r,int left,double weight){
 if(r==14)return left?0:weight*rankScore();
 double sum=0;int fixed=pc[held[r]],remaining=pc[avail[r]];
 for(int q=0;q<=min(left,remaining);q++){counts[r]=fixed+q;sum+=rankExpectation(r+1,left-q,weight*C[remaining][q]);}
 return sum;
}
double expectedPoints(const vector<int>& h,int mask){
 fill(held,held+14,0);fill(avail,avail+14,15);fill(counts,counts+14,0);
 int kept=0,hs[4]={0},as[4]={13,13,13,13};
 for(int i=0;i<N;i++){int r=h[i]/4+2;if(r==14)r=1;int s=h[i]%4,bit=1<<s;avail[r]&=~bit;as[s]--;if(mask&(1<<i)){held[r]|=bit;kept++;hs[s]++;}}
 int need=N-kept,pool=52-N;double denom=C[pool][need],sum=rankExpectation(1,need,1)/denom;
 // Each suit's flush and each suited jack are additive score features.
 for(int s=0;s<4;s++){
  for(int q=max(0,4-hs[s]);q<=need;q++)if(q<=as[s]&&need-q<=pool-as[s])sum+=min(cap,hs[s]+q)*C[as[s]][q]*C[pool-as[s]][need-q]/denom;
  int bit=1<<s;
  if(held[11]&bit){sum+=hs[s]>1?1:1-C[pool-as[s]][need]/denom;}
  else if((avail[11]&bit)&&need){double jackProb=double(need)/pool;sum+=jackProb*(hs[s]?1:1-C[pool-as[s]][need-1]/C[pool-1][need-1]);}
 }
 return sum;
}
int main(int argc,char** argv){
 for(int n=0;n<=52;n++){C[n][0]=1;for(int k=1;k<=7;k++)C[n][k]=n?C[n-1][k]+C[n-1][k-1]:0;}for(int i=0;i<16;i++)pc[i]=__builtin_popcount(i);
 N=argc>1?atoi(argv[1]):6;int samples=argc>2?atoi(argv[2]):128;uint32_t seed=argc>3?strtoul(argv[3],nullptr,10):739021;
 if(N<4||N>7||samples<1)return 1;
 vector<int> fixed;for(int i=4;i<argc;i++)fixed.push_back(atoi(argv[i]));if(!fixed.empty()&&fixed.size()!=N)return 2;
 cout<<"[";
 for(int sample=0;sample<(fixed.empty()?samples:1);sample++){
  vector<int> deck(52);for(int i=0;i<52;i++)deck[i]=i;
  for(int i=51;i>0;i--){seed=1664525u*seed+1013904223u;int j=int(double(seed)/4294967296.0*(i+1));swap(deck[i],deck[j]);}
  vector<int> h=fixed.empty()?vector<int>(deck.begin(),deck.begin()+N):fixed;
  double best=-1,draw=-1;vector<double> evs;
  for(int mask=0;mask<(1<<N);mask++){double ev=expectedPoints(h,mask);best=max(best,ev);if(mask!=(1<<N)-1)draw=max(draw,ev);evs.push_back(ev);}
  if(sample)cout<<",";cout<<setprecision(16);
  if(fixed.empty())cout<<"["<<best<<","<<draw<<"]";
  else{for(int mask=0;mask<(1<<N);mask++){if(mask)cout<<",";cout<<evs[mask];}}
  if(fixed.empty()&&(sample+1)%128==0)cerr<<N<<" cards: "<<sample+1<<"/"<<samples<<"\n";
 }
 cout<<"]\n";return 0;
}
