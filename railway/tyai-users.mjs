const fields='id,username AS login,name,role,banned';
const issue=(status,message)=>Object.assign(new Error(message),{status});
export async function profileIdentity(db,claim) {
  if(!claim)throw issue(403,'需要 TYAI 授权');
  if(claim.kind==='directory'){
    const rows=(await db.prepare('SELECT '+fields+' FROM "user" ORDER BY username').all()).results;
    return {accounts:rows.map(({banned,...row})=>({...row,active:!Number(banned)}))};
  }
  if(!['admin','user'].includes(claim.role))throw issue(403,'站内角色无效');
  const id=claim.local||('tyai-'+claim.sub);
  const get=()=>db.prepare('SELECT '+fields+' FROM "user" WHERE id=?').bind(id).first();
  let row=await get();
  if(claim.kind==='provision'){
    if(claim.local&&!row)throw issue(404,'所选旧账号不存在');
    if(row&&Number(row.banned))throw issue(409,'所选旧账号已停用');
    if(!row){
      const same=await db.prepare('SELECT id FROM "user" WHERE username=?').bind(claim.login).first();
      if(same&&same.id!==id)throw issue(409,'登录名已存在，请明确绑定旧账号');
      const at=Date.now();
      await db.prepare('INSERT INTO "user"(id,name,email,email_verified,username,display_username,role,banned,created_at,updated_at) VALUES(?,?,?,0,?,?,?,0,?,?) ON CONFLICT(id) DO NOTHING')
        .bind(id,claim.name,claim.sub+'@tyai.invalid',claim.login,claim.login,claim.role,at,at).run();
    }
    if(claim.phase==='apply')await db.prepare('UPDATE "user" SET role=?,updated_at=? WHERE id=?').bind(claim.role,Date.now(),id).run();
    return {id};
  }
  if(claim.kind!=='user'||!row||Number(row.banned))throw issue(403,'站内账号不可用');
  return {id:row.id,name:row.name,username:row.login,role:claim.role};
}
