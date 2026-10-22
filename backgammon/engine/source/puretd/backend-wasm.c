/* SPDX-License-Identifier: MIT
 * WASM SIMD inference for the pinned PureTD ReLU equity network.
 * Original model/engine: Copyright (c) 2026 Alex Strehl (see LICENSE.txt).
 * Four board rows share each weight load. Every output still accumulates
 * inputs in their original order, without FMA. Small batches retain the
 * single-row path; inactive tail rows are duplicated and never returned.
 */
#include "puretd_backend.h"
#include <wasm_simd128.h>
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
  if(l<b->layers-1&&n%16){bgc_backend_destroy(b);return NULL;}
  b->in[l]=k;b->out[l]=n;if(n>largest)largest=n;
  b->weights[l]=malloc((size_t)n*k*sizeof(float));b->bias[l]=malloc((size_t)n*sizeof(float));
  if(!b->weights[l]||!b->bias[l]){bgc_backend_destroy(b);return NULL;}
  for(int j=0;j<k;j++)for(int i=0;i<n;i++)b->weights[l][(size_t)j*n+i]=m->weight[l][(size_t)i*k+j];
  memcpy(b->bias[l],m->bias[l],(size_t)n*sizeof(float));
 }
 b->a=malloc((size_t)largest*4*sizeof(float));b->b=malloc((size_t)largest*4*sizeof(float));
 if(!b->a||!b->b){bgc_backend_destroy(b);return NULL;}return b;
}
static void forward_small(bgc_backend *b,const float *x,int stride,int count,float *out) {
 for(int row=0;row<count;row++) {
  const float *in=x+(size_t)row*stride;float *next=b->a;
  for(int l=0;l<b->layers;l++) {
   int n=b->out[l],k=b->in[l];const float *w=b->weights[l];
   if(l==b->layers-1){float sum=b->bias[l][0];for(int j=0;j<k;j++)sum+=w[j]*in[j];next[0]=sum;}
   else for(int i=0;i<n;i+=16) {
    v128_t a=wasm_v128_load(b->bias[l]+i),c=wasm_v128_load(b->bias[l]+i+4),d=wasm_v128_load(b->bias[l]+i+8),e=wasm_v128_load(b->bias[l]+i+12);
    for(int j=0;j<k;j++) {
     if(in[j]==0)continue;
     v128_t v=wasm_f32x4_splat(in[j]);const float *p=w+(size_t)j*n+i;
     a=wasm_f32x4_add(a,wasm_f32x4_mul(v,wasm_v128_load(p)));
     c=wasm_f32x4_add(c,wasm_f32x4_mul(v,wasm_v128_load(p+4)));
     d=wasm_f32x4_add(d,wasm_f32x4_mul(v,wasm_v128_load(p+8)));
     e=wasm_f32x4_add(e,wasm_f32x4_mul(v,wasm_v128_load(p+12)));
    }
    v128_t z=wasm_f32x4_splat(0);
    wasm_v128_store(next+i,wasm_f32x4_max(a,z));wasm_v128_store(next+i+4,wasm_f32x4_max(c,z));
    wasm_v128_store(next+i+8,wasm_f32x4_max(d,z));wasm_v128_store(next+i+12,wasm_f32x4_max(e,z));
   }
   in=next;next=next==b->a?b->b:b->a;
  }
  out[row]=in[0];
 }
}
void bgc_backend_forward(bgc_backend *b,const float *x,int stride,int count,float *out) {
 if(count<4){forward_small(b,x,stride,count,out);return;}
 for(int row=0;row<count;row+=4) {
  int rows=count-row<4?count-row:4;
  const float *in=x+(size_t)row*stride;float *next=b->a;int step=stride;
  for(int l=0;l<b->layers;l++) {
   int n=b->out[l],k=b->in[l];const float *w=b->weights[l];
   if(l==b->layers-1) {
    for(int r=0;r<rows;r++){float sum=b->bias[l][0];for(int j=0;j<k;j++)sum+=w[j]*in[r*step+j];next[r]=sum;}
   } else for(int i=0;i<n;i+=16) {
    v128_t a00=wasm_v128_load(b->bias[l]+i+0);
    v128_t a01=wasm_v128_load(b->bias[l]+i+4);
    v128_t a02=wasm_v128_load(b->bias[l]+i+8);
    v128_t a03=wasm_v128_load(b->bias[l]+i+12);
    v128_t a10=wasm_v128_load(b->bias[l]+i+0);
    v128_t a11=wasm_v128_load(b->bias[l]+i+4);
    v128_t a12=wasm_v128_load(b->bias[l]+i+8);
    v128_t a13=wasm_v128_load(b->bias[l]+i+12);
    v128_t a20=wasm_v128_load(b->bias[l]+i+0);
    v128_t a21=wasm_v128_load(b->bias[l]+i+4);
    v128_t a22=wasm_v128_load(b->bias[l]+i+8);
    v128_t a23=wasm_v128_load(b->bias[l]+i+12);
    v128_t a30=wasm_v128_load(b->bias[l]+i+0);
    v128_t a31=wasm_v128_load(b->bias[l]+i+4);
    v128_t a32=wasm_v128_load(b->bias[l]+i+8);
    v128_t a33=wasm_v128_load(b->bias[l]+i+12);
    for(int j=0;j<k;j++) {
     float s0=in[(rows>0?0:0)*step+j];
     float s1=in[(rows>1?1:0)*step+j];
     float s2=in[(rows>2?2:0)*step+j];
     float s3=in[(rows>3?3:0)*step+j];
     if(s0==0&&s1==0&&s2==0&&s3==0)continue;
     const float *p=w+(size_t)j*n+i;
     v128_t w0=wasm_v128_load(p+0);
     v128_t w1=wasm_v128_load(p+4);
     v128_t w2=wasm_v128_load(p+8);
     v128_t w3=wasm_v128_load(p+12);
     v128_t v0=wasm_f32x4_splat(s0);
     a00=wasm_f32x4_add(a00,wasm_f32x4_mul(v0,w0));
     a01=wasm_f32x4_add(a01,wasm_f32x4_mul(v0,w1));
     a02=wasm_f32x4_add(a02,wasm_f32x4_mul(v0,w2));
     a03=wasm_f32x4_add(a03,wasm_f32x4_mul(v0,w3));
     v128_t v1=wasm_f32x4_splat(s1);
     a10=wasm_f32x4_add(a10,wasm_f32x4_mul(v1,w0));
     a11=wasm_f32x4_add(a11,wasm_f32x4_mul(v1,w1));
     a12=wasm_f32x4_add(a12,wasm_f32x4_mul(v1,w2));
     a13=wasm_f32x4_add(a13,wasm_f32x4_mul(v1,w3));
     v128_t v2=wasm_f32x4_splat(s2);
     a20=wasm_f32x4_add(a20,wasm_f32x4_mul(v2,w0));
     a21=wasm_f32x4_add(a21,wasm_f32x4_mul(v2,w1));
     a22=wasm_f32x4_add(a22,wasm_f32x4_mul(v2,w2));
     a23=wasm_f32x4_add(a23,wasm_f32x4_mul(v2,w3));
     v128_t v3=wasm_f32x4_splat(s3);
     a30=wasm_f32x4_add(a30,wasm_f32x4_mul(v3,w0));
     a31=wasm_f32x4_add(a31,wasm_f32x4_mul(v3,w1));
     a32=wasm_f32x4_add(a32,wasm_f32x4_mul(v3,w2));
     a33=wasm_f32x4_add(a33,wasm_f32x4_mul(v3,w3));
    }
    v128_t z=wasm_f32x4_splat(0);
    wasm_v128_store(next+0*n+i+0,wasm_f32x4_max(a00,z));
    wasm_v128_store(next+0*n+i+4,wasm_f32x4_max(a01,z));
    wasm_v128_store(next+0*n+i+8,wasm_f32x4_max(a02,z));
    wasm_v128_store(next+0*n+i+12,wasm_f32x4_max(a03,z));
    wasm_v128_store(next+1*n+i+0,wasm_f32x4_max(a10,z));
    wasm_v128_store(next+1*n+i+4,wasm_f32x4_max(a11,z));
    wasm_v128_store(next+1*n+i+8,wasm_f32x4_max(a12,z));
    wasm_v128_store(next+1*n+i+12,wasm_f32x4_max(a13,z));
    wasm_v128_store(next+2*n+i+0,wasm_f32x4_max(a20,z));
    wasm_v128_store(next+2*n+i+4,wasm_f32x4_max(a21,z));
    wasm_v128_store(next+2*n+i+8,wasm_f32x4_max(a22,z));
    wasm_v128_store(next+2*n+i+12,wasm_f32x4_max(a23,z));
    wasm_v128_store(next+3*n+i+0,wasm_f32x4_max(a30,z));
    wasm_v128_store(next+3*n+i+4,wasm_f32x4_max(a31,z));
    wasm_v128_store(next+3*n+i+8,wasm_f32x4_max(a32,z));
    wasm_v128_store(next+3*n+i+12,wasm_f32x4_max(a33,z));
   }
   in=next;step=n;next=next==b->a?b->b:b->a;
  }
  for(int r=0;r<rows;r++)out[row+r]=in[r];
 }
}
void bgc_backend_forward_delta(bgc_backend *b,const float *parent,const float *x,int stride,int count,float *out){(void)parent;bgc_backend_forward(b,x,stride,count,out);}
int bgc_backend_row_exact(void){return 1;}
const char *bgc_backend_name(void){return "wasm-simd";}
const char *bgc_backend_describe(const bgc_backend *b){(void)b;return "WASM SIMD, four-row batches, ordered float32 sums, ReLU equity";}
