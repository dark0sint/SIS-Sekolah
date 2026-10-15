const express=require('express'),Database=require('better-sqlite3'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),fs=require('fs');
const SECRET=process.env.JWT_SECRET||'GANTI-RAHASIA-INI';
fs.mkdirSync('data',{recursive:true});
const db=new Database(process.env.DB_PATH||'data/sis.db');
const ALL=['admin','guru','ortu','siswa'],STAFF=['admin','guru'];
// Definisi modul: label, kolom, kolom angka, hak baca (r), hak tulis (w), scope = kolom yg dibatasi utk ortu/siswa
const META={
 students:{label:'Data Siswa',cols:['nis','nama','jk','tgl_lahir','alamat','kelas_id','wali_hp','status'],r:ALL,w:['admin'],scope:'id'},
 teachers:{label:'Data Guru/Staf',cols:['nip','nama','mapel','hp','gaji_pokok'],num:['gaji_pokok'],r:STAFF,w:['admin']},
 classes:{label:'Kelas',cols:['nama','tingkat','wali_kelas'],r:ALL,w:['admin']},
 subjects:{label:'Mata Pelajaran',cols:['nama','kkm'],num:['kkm'],r:ALL,w:['admin']},
 schedules:{label:'Jadwal Pelajaran',cols:['kelas_id','mapel','hari','jam','guru'],r:ALL,w:['admin']},
 attendance:{label:'Absensi',cols:['student_id','tanggal','status'],r:ALL,w:STAFF,scope:'student_id'},
 grades:{label:'Nilai / e-Rapor',cols:['student_id','mapel','jenis','nilai','semester'],num:['nilai'],r:ALL,w:STAFF,scope:'student_id'},
 invoices:{label:'SPP & Tagihan',cols:['student_id','keterangan','jumlah','jatuh_tempo','status'],num:['jumlah'],r:ALL,w:['admin'],scope:'student_id'},
 payroll:{label:'Penggajian',cols:['teacher_id','bulan','gaji','potongan'],num:['gaji','potongan'],r:['admin'],w:['admin']},
 announcements:{label:'Pengumuman',cols:['judul','isi','tanggal'],r:ALL,w:STAFF},
 applicants:{label:'PPDB',cols:['nama','nik','asal_sekolah','hp','status'],r:['admin'],w:['admin']},
 assets:{label:'Aset & Inventaris',cols:['nama','kategori','jumlah','kondisi'],num:['jumlah'],r:['admin'],w:['admin']}
};
for(const[t,m]of Object.entries(META))db.exec(`CREATE TABLE IF NOT EXISTS ${t}(id INTEGER PRIMARY KEY,${m.cols.join(',')})`);
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username UNIQUE,password,role,name,ref_id)`);
if(!db.prepare('SELECT 1 FROM users').get()){
 const u=db.prepare('INSERT INTO users(username,password,role,name,ref_id) VALUES(?,?,?,?,?)'),h=p=>bcrypt.hashSync(p,10);
 db.prepare("INSERT INTO students(nis,nama,jk,tgl_lahir,alamat,kelas_id,wali_hp,status) VALUES('1001','Budi Santoso','L','2012-05-01','Lampung','7A','08123456789','aktif')").run();
 db.prepare("INSERT INTO invoices(student_id,keterangan,jumlah,jatuh_tempo,status) VALUES(1,'SPP Oktober',250000,'2026-10-10','belum')").run();
 u.run('admin',h('admin123'),'admin','Administrator',null);u.run('guru1',h('guru123'),'guru','Guru Contoh',null);u.run('ortu1',h('ortu123'),'ortu','Wali Budi',1);
 console.log('Akun awal: admin/admin123, guru1/guru123, ortu1/ortu123 -> SEGERA GANTI PASSWORD');
}
const app=express();app.use(express.json({limit:'1mb'}));app.use(express.static('public'));
const auth=(req,res,next)=>{try{req.user=jwt.verify((req.headers.authorization||'').slice(7),SECRET);next()}catch{res.status(401).json({error:'Belum login'})}};
const only=(...r)=>(req,res,next)=>r.includes(req.user.role)?next():res.status(403).json({error:'Tidak diizinkan'});
const notify=async t=>{if(process.env.WA_WEBHOOK)try{await fetch(process.env.WA_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t})})}catch{}};

app.post('/api/login',(req,res)=>{const{username,password}=req.body||{};const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);
 if(!u||!bcrypt.compareSync(password||'',u.password))return res.status(401).json({error:'Username/password salah'});
 const user={id:u.id,role:u.role,name:u.name,ref_id:u.ref_id};res.json({token:jwt.sign(user,SECRET,{expiresIn:'12h'}),user});});
app.post('/api/password',auth,(req,res)=>{db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(req.body.password||'',10),req.user.id);res.json({ok:1})});
// PPDB publik
app.post('/api/ppdb',(req,res)=>{const{nama,nik,asal_sekolah,hp}=req.body||{};if(!nama||!nik)return res.status(400).json({error:'Nama & NIK wajib'});
 db.prepare("INSERT INTO applicants(nama,nik,asal_sekolah,hp,status) VALUES(?,?,?,?,'menunggu')").run(nama,nik,asal_sekolah||'',hp||'');res.json({ok:1})});
app.get('/api/ppdb/cek',(req,res)=>res.json(db.prepare('SELECT nama,status FROM applicants WHERE nik=?').get(req.query.nik)||{status:'tidak ditemukan'}));

app.get('/api/meta',auth,(req,res)=>res.json(Object.fromEntries(Object.entries(META).filter(([,m])=>m.r.includes(req.user.role)).map(([k,m])=>[k,{label:m.label,cols:m.cols,write:m.w.includes(req.user.role)}]))));
app.get('/api/dashboard',auth,(req,res)=>{const c=t=>db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n,g=q=>db.prepare(q).get();
 const hadir=g("SELECT COUNT(*) n FROM attendance WHERE status='hadir'").n,tot=c('attendance');
 res.json({siswa:c('students'),guru:c('teachers'),pelamar:c('applicants'),hadirPersen:tot?Math.round(hadir*100/tot):0,
  tunggakan:g("SELECT COALESCE(SUM(jumlah),0) n FROM invoices WHERE status!='lunas'").n,pemasukan:g("SELECT COALESCE(SUM(jumlah),0) n FROM invoices WHERE status='lunas'").n});});
app.get('/api/rapor/:sid',auth,(req,res)=>{const sid=+req.params.sid;if(['ortu','siswa'].includes(req.user.role)&&req.user.ref_id!==sid)return res.status(403).json({error:'Tidak diizinkan'});
 res.json({siswa:db.prepare('SELECT nama,nis,kelas_id FROM students WHERE id=?').get(sid),
  nilai:db.prepare('SELECT mapel,ROUND(AVG(nilai),1) rata,COUNT(*) n FROM grades WHERE student_id=? GROUP BY mapel').all(sid)})});
app.post('/api/invoices/:id/pay',auth,(req,res)=>{ // titik integrasi payment gateway (Midtrans/Xendit): panggil di sini, set 'lunas' via webhook
 const i=db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);if(!i)return res.sendStatus(404);
 if(req.user.role==='admin'||req.user.ref_id===+i.student_id){db.prepare("UPDATE invoices SET status='lunas' WHERE id=?").run(i.id);res.json({ok:1})}else res.sendStatus(403)});
app.get('/api/export/dapodik',auth,only('admin'),(req,res)=>{const rows=db.prepare('SELECT nis,nama,jk,tgl_lahir,alamat,kelas_id,status FROM students').all();
 res.type('text/csv').attachment('siswa-dapodik.csv').send(['nis,nama,jk,tgl_lahir,alamat,kelas,status',...rows.map(r=>Object.values(r).map(v=>`"${v??''}"`).join(','))].join('\n'))});

app.use('/api/t/:t',auth,(req,res,next)=>{const m=META[req.params.t];if(!m)return res.sendStatus(404);
 const write=req.method!=='GET';if(!(write?m.w:m.r).includes(req.user.role))return res.status(403).json({error:'Tidak diizinkan'});req.m=m;next()});
app.get('/api/t/:t',(req,res)=>{const{m,user}=req,t=req.params.t;let q=`SELECT * FROM ${t}`,a=[];
 if(m.scope&&['ortu','siswa'].includes(user.role)){q+=` WHERE ${m.scope}=?`;a=[user.ref_id]}res.json(db.prepare(q+' ORDER BY id DESC').all(...a))});
const vals=(m,b)=>m.cols.map(c=>m.num?.includes(c)?Number(b[c])||0:(b[c]??''));
app.post('/api/t/:t',(req,res)=>{const{m}=req,t=req.params.t;const r=db.prepare(`INSERT INTO ${t}(${m.cols}) VALUES(${m.cols.map(()=>'?')})`).run(...vals(m,req.body));
 if(t==='announcements')notify(`${req.body.judul}\n${req.body.isi}`);res.json({id:r.lastInsertRowid})});
app.put('/api/t/:t/:id',(req,res)=>{const{m}=req;db.prepare(`UPDATE ${req.params.t} SET ${m.cols.map(c=>c+'=?')} WHERE id=?`).run(...vals(m,req.body),req.params.id);res.json({ok:1})});
app.delete('/api/t/:t/:id',(req,res)=>{db.prepare(`DELETE FROM ${req.params.t} WHERE id=?`).run(req.params.id);res.json({ok:1})});
app.listen(process.env.PORT||3000,()=>console.log('SIS berjalan di port',process.env.PORT||3000));
