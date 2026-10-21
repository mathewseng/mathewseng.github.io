// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const spaceError=e=>e?.code==='ENOSPC'||e?.code==='EDQUOT';
// A failed append may have written part of a JSON line. Remove that fragment
// before yielding; another worker can then append without corrupting its record.
export async function appendCheckpoint(file,record,{io=fs,pause=delay,onRetry=()=>{}}={}){
 const line=JSON.stringify(record)+'\n';
 for(;;){
  const previous=io.existsSync(file)?io.statSync(file).size:0;
  try{io.appendFileSync(file,line);return;}
  catch(error){
   if(!spaceError(error))throw error;
   if(io.existsSync(file))io.truncateSync(file,previous);
   onRetry(error);await pause(5000);
  }
 }
}
export async function retryCheckpoint(write,{pause=delay,onRetry=()=>{}}={}){
 for(;;)try{return write();}catch(error){if(!spaceError(error))throw error;onRetry(error);await pause(5000);}
}
