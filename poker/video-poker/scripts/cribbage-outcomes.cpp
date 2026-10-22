#define main capped_analysis_main
#include "cribbage-analyze.cpp"
#undef main
int main(int argc,char** argv){
 for(int n=0;n<=52;n++){C[n][0]=1;for(int k=1;k<=7;k++)C[n][k]=n?C[n-1][k]+C[n-1][k-1]:0;}for(int i=0;i<16;i++)pc[i]=__builtin_popcount(i);
 if(argc!=8)return 1;N=atoi(argv[1]);int samples=atoi(argv[2]);uint32_t seed=strtoul(argv[3],nullptr,10);int fees[4];for(int i=0;i<4;i++)fees[i]=atoi(argv[4+i]);
 if(N<4||N>7||samples<1)return 2;
 double bins[4][512]={0};
 for(int deal=0;deal<samples;deal++){
  vector<int> deck(52);for(int i=0;i<52;i++)deck[i]=i;for(int i=51;i>0;i--){seed=1664525u*seed+1013904223u;int j=int(double(seed)/4294967296.0*(i+1));swap(deck[i],deck[j]);}vector<int> h(deck.begin(),deck.begin()+N);
  double best[4]={-1e300,-1e300,-1e300,-1e300};int stakes[4]={1,1,1,1},heldCounts[4]={0};Hist chosen[4];
  for(int mask=0;mask<(1<<N);mask++){
   auto dist=distribution(h,mask);int heldCount=__builtin_popcount(mask);
   for(int mode=0;mode<4;mode++){
    double net=0;for(int score=0;score<128;score++)net+=dist[score]*(mode>=2?score-fees[mode]:max(0,score-fees[mode])-1);
    for(int st=1;st<=((mode%2&&mask!=(1<<N)-1)?2:1);st++)if(st*net>best[mode]+1e-12||(abs(st*net-best[mode])<=1e-12&&(st<stakes[mode]||(st==stakes[mode]&&heldCount>heldCounts[mode])))){best[mode]=st*net;stakes[mode]=st;heldCounts[mode]=heldCount;chosen[mode]=dist;}
   }
  }
  for(int mode=0;mode<4;mode++)for(int score=0;score<128;score++){int pnl=stakes[mode]*(mode>=2?score-fees[mode]:max(0,score-fees[mode])-1);if(pnl+128<0||pnl+128>=512)return 3;bins[mode][pnl+128]+=chosen[mode][score];}
  if((deal+1)%128==0)cerr<<N<<" cards: "<<deal+1<<"/"<<samples<<"\n";
 }
 cout<<"[";for(int mode=0;mode<4;mode++){if(mode)cout<<",";cout<<"[";bool first=true;for(int i=0;i<512;i++)if(bins[mode][i]>1e-12){if(!first)cout<<",";first=false;cout<<setprecision(16)<<"["<<i-128<<","<<bins[mode][i]<<"]";}cout<<"]";}cout<<"]\n";
}
