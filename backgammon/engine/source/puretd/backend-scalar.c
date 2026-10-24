/* SPDX-License-Identifier: MIT
 * WASM scalar inference for the pinned PureTD ReLU equity network.
 * Original model/engine: Copyright (c) 2026 Alex Strehl (see LICENSE.txt).
 * Each output accumulates inputs in their original order, without FMA.
 */
#include "puretd_backend.h"
#include <stdlib.h>
#include <string.h>
struct bgc_backend {
 int layers, in[NN_MAX_LAYERS+1],out[NN_MAX_LAYERS+1];
 float *weights[NN_MAX_LAYERS+1], *bias[NN_MAX_LAYERS+1],*a,*b;
};
void bgc_backend_destroy(bgc_backend *b) {
 if(!b)return;
 for(int l=0;l<b->layers;l++){free(b->weights[l]);free(b->bias[l]);}
 free(b->a);free(b->b);free(b);
}
bgc_backend *bgc_backend_create(const NNModel *m) {
 if(m->activation!=NN_ACTIVATION_RELU||m->output_mode!=NN_OUTPUT_EQUITY||m->layer_out[m->num_hidden]!=1)return NULL;
 bgc_backend *b=calloc(1,sizeof(*b));if(!b)return NULL;
 b->layers=m->num_hidden+1;int largest=m->input_size;
 for(int l=0;l<b->layers;l++) {
  int n=m->layer_out[l],k=m->layer_in[l];
  if(l<b->layers-1&&n%8){bgc_backend_destroy(b);return NULL;}
  b->in[l]=k;b->out[l]=n;if(n>largest)largest=n;
  b->weights[l]=malloc((size_t)n*k*sizeof(float));b->bias[l]=malloc((size_t)n*sizeof(float));
  if(!b->weights[l]||!b->bias[l]){bgc_backend_destroy(b);return NULL;}
  for(int j=0;j<k;j++)for(int i=0;i<n;i++)b->weights[l][(size_t)j*n+i]=m->weight[l][(size_t)i*k+j];
  memcpy(b->bias[l],m->bias[l],(size_t)n*sizeof(float));
 }
 b->a=malloc((size_t)largest*sizeof(float));b->b=malloc((size_t)largest*sizeof(float));
 if(!b->a||!b->b){bgc_backend_destroy(b);return NULL;}return b;
}
void bgc_backend_forward(bgc_backend *b,const float *x,int stride,int count,float *out) {
 for(int row=0;row<count;row++) {
  const float *in=x+(size_t)row*stride;float *next=b->a;
  for(int l=0;l<b->layers;l++) {
   int n=b->out[l],k=b->in[l];const float *w=b->weights[l];
   if(l==b->layers-1){float sum=b->bias[l][0];for(int j=0;j<k;j++)sum+=w[j]*in[j];next[0]=sum;}
   else for(int i=0;i<n;i+=8) {
    float a0=b->bias[l][i+0];
    float a1=b->bias[l][i+1];
    float a2=b->bias[l][i+2];
    float a3=b->bias[l][i+3];
    float a4=b->bias[l][i+4];
    float a5=b->bias[l][i+5];
    float a6=b->bias[l][i+6];
    float a7=b->bias[l][i+7];
    for(int j=0;j<k;j++) {
     const float v=in[j];if(v==0)continue;const float *p=w+(size_t)j*n+i;
     a0+=v*p[0];
     a1+=v*p[1];
     a2+=v*p[2];
     a3+=v*p[3];
     a4+=v*p[4];
     a5+=v*p[5];
     a6+=v*p[6];
     a7+=v*p[7];
    }
    next[i+0]=a0>0?a0:0;
    next[i+1]=a1>0?a1:0;
    next[i+2]=a2>0?a2:0;
    next[i+3]=a3>0?a3:0;
    next[i+4]=a4>0?a4:0;
    next[i+5]=a5>0?a5:0;
    next[i+6]=a6>0?a6:0;
    next[i+7]=a7>0?a7:0;
   }
   in=next;next=next==b->a?b->b:b->a;
  }
  out[row]=in[0];
 }
}
void bgc_backend_forward_delta(bgc_backend *b,const float *parent,const float *x,int stride,int count,float *out){(void)parent;bgc_backend_forward(b,x,stride,count,out);}
int bgc_backend_row_exact(void){return 1;}
const char *bgc_backend_name(void){return "wasm-scalar";}
const char *bgc_backend_describe(const bgc_backend *b){(void)b;return "WASM scalar, eight ordered accumulators, ReLU equity";}
