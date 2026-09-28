// Run only on the owner's machine. Never bundle this script or admin secrets.
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_PUBLISHABLE_KEY,KAYAN_ADMIN_PASSWORD}=process.env;
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!SUPABASE_PUBLISHABLE_KEY||!KAYAN_ADMIN_PASSWORD)throw Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY and KAYAN_ADMIN_PASSWORD in the current terminal only.');
if(KAYAN_ADMIN_PASSWORD.length<8)throw Error('Administrator password must have at least 8 characters.');
const username=process.env.KAYAN_ADMIN_USERNAME||'superadmin';
if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username))throw Error('Invalid username');
const client=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const workspaceId=randomUUID();let userId;
try{
 const {error:workspaceError}=await client.from('kayan_workspaces').insert({id:workspaceId,name:process.env.KAYAN_COMPANY||'كيان'});if(workspaceError)throw Error('Could not create workspace. Apply migrations first.');
 const email=`${randomUUID()}@${workspaceId}.kayan.invalid`;
 const {data,error}=await client.auth.admin.createUser({email,password:KAYAN_ADMIN_PASSWORD,email_confirm:true});if(error)throw Error('Could not create cloud administrator.');userId=data.user.id;
 const {error:memberError}=await client.from('kayan_members').insert({id:userId,workspace_id:workspaceId,username,name:'سوبر أدمن',login_email:email,role:'super_admin'});if(memberError)throw Error('Could not authorize cloud administrator.');
 const {error:notificationError}=await client.from('kayan_notifications').insert({workspace_id:workspaceId});if(notificationError)throw Error('Could not configure notifications.');
 writeFileSync('cloud.public.json',JSON.stringify({url:SUPABASE_URL,publishableKey:SUPABASE_PUBLISHABLE_KEY,workspaceId},null,2));
 console.log('Workspace created. Public connection details saved to cloud.public.json. No password/admin key was saved.');
}catch(e){if(userId)await client.auth.admin.deleteUser(userId);await client.from('kayan_workspaces').delete().eq('id',workspaceId);throw e;}
