// Buy one buff from a player buff store (L2Toggle): target the seller twice -> page; choose the target mode by button label; page forward
// until the skill icon shows; click it. The page arrives as an NPC html (saved to Logs/npc_<char>.html by the character's script).
const {call}=require(process.env.TMP+'/mcplib.js');const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const [cfg, charName, sellerId, skillId, mode] = process.argv.slice(2);
const sel={config_path:cfg}, F=`C:/L2Swarm/Logs/npc_${charName}.html`;
const page=()=>{try{return fs.readFileSync(F,'utf8')}catch(e){return ''}};
const mt=()=>{try{return fs.statSync(F).mtimeMs}catch(e){return 0}};
async function waitNew(t0){for(let i=0;i<20;i++){await sleep(250);if(mt()>t0)return page();}return null;}
const code=(h,re)=>{const m=h.match(re);return m?m[1]:null;};
async function click(c){const t0=mt();await call('send_game_action',Object.assign({action:'bypass',params:{command:c}},sel));return await waitNew(t0);}
(async()=>{
  let t0=mt();await call('send_game_action',Object.assign({action:'select_object',params:{obj_id:Number(sellerId)}},sel));await sleep(600);
  await call('send_game_action',Object.assign({action:'select_object',params:{obj_id:Number(sellerId)}},sel));
  let h=await waitNew(t0); if(!h){console.log('no store page');return;}
  console.log('store:',(h.match(/<title>([^<]*)/)||[])[1]);
  // target mode (Player / Pet / Party / Select): the selected one is shown as "> Name"
  if(mode){const re=new RegExp('value="(?:> )?'+mode+'" action="bypass -h ([0-9a-f]+)"','i');const c=code(h,re);
    if(!/value="> /.test(h)||!new RegExp('value="> '+mode+'"','i').test(h)){ if(!c){console.log('no '+mode+' button');return;} const h2=await click(c); if(h2)h=h2; }
    console.log('mode now:',(h.match(/value="> ([A-Za-z]+)"/)||[])[1]);}
  for(let p=0;p<6;p++){
    const c=code(h,new RegExp('action="bypass -h ([0-9a-f]+)"[^>]*back=icon\.skill0*'+skillId+'\b'));
    if(c){console.log('page',(h.match(/(\d+)\/(\d+)/)||[])[0],'skill',skillId,'button',c);const t1=mt();await call('send_game_action',Object.assign({action:'bypass',params:{command:c}},sel));await sleep(1500);console.log('clicked');return;}
    const nx=code(h,/action="bypass -h ([0-9a-f]+)"[^>]*shortcut_next/); if(!nx){console.log('skill not found, no next page');return;}
    const h2=await click(nx); if(!h2){console.log('next page did not come');return;} h=h2;
  }
})();
