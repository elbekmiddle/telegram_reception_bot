import { v2 as cloudinary } from 'cloudinary'
import { getEnv } from '../../config/env'
let configured = false
function ensure(){ if(configured) return; const env=getEnv(); if(!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return; cloudinary.config({ cloud_name:env.CLOUDINARY_CLOUD_NAME, api_key:env.CLOUDINARY_API_KEY, api_secret:env.CLOUDINARY_API_SECRET }); configured=true }
export async function uploadImageBuffer(buffer:Buffer): Promise<{ url:string; publicId:string } | null> { ensure(); if(!configured) return null; return new Promise((resolve,reject)=>{ const stream = cloudinary.uploader.upload_stream({ folder:'telegram-reception-bot' }, (error,result) => { if(error) return reject(error); if(!result?.secure_url || !result.public_id) return resolve(null); resolve({ url:result.secure_url, publicId:result.public_id }) }); stream.end(buffer) }) }
