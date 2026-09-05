/***** ỤM BÒ MILK FINANCE - finance.gs - Auto tạo 4 sheet *****/
const FINANCE_ID = 'REPLACE_FINANCE_MASTER_ID';
const TEMPLATE_NAME = '_TEMPLATE_LUONG';
const SECRET = 'umbomilk_secret_2026';

function onOpen(){
  SpreadsheetApp.getUi().createMenu('Finance HR')
    .addItem('Setup 4 Sheet Finance', 'setupFinanceSheets')
    .addItem('Tạo lương tháng', 'createMonthlySheet')
    .addItem('Test Webhook', 'testWebhook')
    .addToUi();
  // Tự động tạo nếu thiếu
  try{ setupFinanceSheets(); }catch(e){}
}

function setupFinanceSheets(){
  const ss = SpreadsheetApp.openById(FINANCE_ID);
  let created=[];
  // 1. MASTER_DATA
  let sh = ss.getSheetByName('MASTER_DATA');
  if(!sh){ sh=ss.insertSheet('MASTER_DATA'); sh.getRange(1,1,1,10).setValues([['BH_Code','HoTen','SDT','BranchGoc','BranchHienTai','Status','NgayVao','NgayLenChinhThuc','DonGiaTraining','DonGiaOfficial']]); sh.getRange(1,1,1,10).setFontWeight('bold').setBackground('#FCE4EC'); sh.setFrozenRows(1); created.push('MASTER_DATA'); }
  // 2. _TEMPLATE_LUONG (ẩn)
  sh = ss.getSheetByName(TEMPLATE_NAME);
  if(!sh){ sh=ss.insertSheet(TEMPLATE_NAME);
    // Header
    sh.getRange(1,1,1,40).setValues([['BH_Code','HoTen','Branch','Shift','01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','Tổng giờ','Ngày công','Lương Training','Lương Official','Hoàn cọc','Tổng lương']]);
    sh.getRange(2,1,1,40).setValues([['','','','','01/08','02/08','03/08','04/08','05/08','06/08','07/08','08/08','09/08','10/08','11/08','12/08','13/08','14/08','15/08','16/08','17/08','18/08','19/08','20/08','21/08','22/08','23/08','24/08','25/08','26/08','27/08','28/08','29/08','30/08','31/08','','','','','','']]);
    sh.getRange(3,1,1,40).setValues([['','','','','T2','T3','T4','T5','T6','T7','CN','T2','T3','T4','T5','T6','T7','CN','T2','T3','T4','T5','T6','T7','CN','T2','T3','T4','T5','T6','T7','CN','T2','T3','','','','','','']]);
    // Công thức mẫu dòng 6
    sh.getRange(6,36,1,1).setFormula('=SUM(E6:AI6)'); // Tổng giờ
    sh.getRange(6,37,1,1).setFormula('=AJ6/8'); // Ngày công
    sh.getRange(6,38,1,1).setFormula('=SUMPRODUCT((E$3:AI$3 < TEXT($H6,"yyyy-mm-dd"))*E6:AI6)*21000'); // Training
    sh.getRange(6,39,1,1).setFormula('=SUMPRODUCT((E$3:AI$3 >= TEXT($H6,"yyyy-mm-dd"))*E6:AI6)*25500'); // Official
    sh.getRange(6,40,1,1).setFormula('=XLOOKUP(A6, DONG_PHUC!A:A, DONG_PHUC!C:C, 0)+XLOOKUP(A6, KHAM_SUC_KHOE!A:A, KHAM_SUC_KHOE!C:C, 0)'); // Hoàn
    sh.getRange(6,41,1,1).setFormula('=AL6+AM6+AN6'); // Tổng lương
    sh.getRange(1,1,1,40).setFontWeight('bold').setBackground('#FCE4EC');
    sh.hideSheet(); created.push(TEMPLATE_NAME+' (ẩn)');
  }
  // 3. DONG_PHUC
  sh = ss.getSheetByName('DONG_PHUC');
  if(!sh){ sh=ss.insertSheet('DONG_PHUC'); sh.getRange(1,1,1,5).setValues([['BH_Code','HoTen','SoTienHoan','NgayHoan','GhiChu']]); sh.getRange(1,1,1,5).setFontWeight('bold').setBackground('#FFF3E0'); sh.setFrozenRows(1); created.push('DONG_PHUC'); }
  // 4. KHAM_SUC_KHOE
  sh = ss.getSheetByName('KHAM_SUC_KHOE');
  if(!sh){ sh=ss.insertSheet('KHAM_SUC_KHOE'); sh.getRange(1,1,1,5).setValues([['BH_Code','HoTen','SoTienHoan','NgayHoan','GhiChu']]); sh.getRange(1,1,1,5).setFontWeight('bold').setBackground('#E8F5E9'); sh.setFrozenRows(1); created.push('KHAM_SUC_KHOE'); }
  if(created.length) SpreadsheetApp.getUi().alert('Đã tự động tạo: '+created.join(', '));
  return {success:true, created};
}

function createMonthlySheet(month,year){
  setupFinanceSheets();
  month=month||new Date().getMonth()+1; year=year||new Date().getFullYear();
  const ss=SpreadsheetApp.openById(FINANCE_ID);
  const tpl=ss.getSheetByName(TEMPLATE_NAME);
  const name=`LUONG_THANG_${String(month).padStart(2,'0')}_${year}`;
  if(ss.getSheetByName(name)) return {exists:true, name};
  const sh=tpl.copyTo(ss); sh.setName(name); sh.showSheet(); sh.activate();
  const days=new Date(year,month,0).getDate();
  const vals=Array(31).fill('').map((_,i)=> i<days ? `${String(i+1).padStart(2,'0')}/${String(month).padStart(2,'0')}` : '');
  sh.getRange(3,5,1,31).setValues([vals]);
  const thu=Array(31).fill('').map((_,i)=>{ if(i>=days) return ''; const d=new Date(year,month-1,i+1); return ['CN','T2','T3','T4','T5','T6','T7'][d.getDay()]; });
  sh.getRange(4,5,1,31).setValues([thu]);
  if(days<31) sh.hideColumns(5+days,31-days); else sh.showColumns(5,31);
  const master=ss.getSheetByName('MASTER_DATA');
  if(master && master.getLastRow()>1){
    const data=master.getRange(2,1,master.getLastRow()-1,4).getValues().filter(r=> r[0] && r[3]!=='RESIGNED');
    if(data.length) sh.getRange(6,1,data.length,4).setValues(data.map(r=>[r[0],r[1],r[2],r[3]]));
  }
  return {success:true, name, days};
}

function doPost(e){
  try{
    setupFinanceSheets();
    const data=JSON.parse(e.postData.contents);
    if(data.secret!==SECRET) return json({success:false,error:'Unauthorized'});
    const ss=SpreadsheetApp.openById(FINANCE_ID);
    if(data.action==='UPSERT_EMPLOYEE') upsertMaster(ss.getSheetByName('MASTER_DATA'), data.payload);
    else if(data.action==='UPSERT_TIMEKEEPING'){ const p=data.payload; const shName=`LUONG_THANG_${p.date.slice(5,7)}_${p.date.slice(0,4)}`; let sh=ss.getSheetByName(shName); if(!sh) sh=createMonthlySheet(parseInt(p.date.slice(5,7)), parseInt(p.date.slice(0,4))).sheet || ss.getSheetByName(shName); upsertHours(sh,p); }
    else if(data.action==='UPSERT_DONGPHUC') upsertByBH(ss.getSheetByName('DONG_PHUC'), data.payload);
    else if(data.action==='UPSERT_KHAMSUC') upsertByBH(ss.getSheetByName('KHAM_SUC_KHOE'), data.payload);
    return json({success:true});
  }catch(err){ return json({success:false,error:err.toString()}); }
}
function upsertMaster(sh,p){
  const vals=sh.getRange(2,1,Math.max(sh.getLastRow()-1,1),1).getValues().flat();
  let row=vals.indexOf(p.bhCode); if(row==-1) row=sh.getLastRow()+1; else row=row+2;
  sh.getRange(row,1,1,7).setValues([[p.bhCode,p.hoTen||p.name,p.branchGoc,p.branchId,p.status,p.ngayLenChinhThuc||'',p.status==='OFFICIAL'?25500:21000]]);
}
function upsertHours(sh,p){
  const dateCol=4+parseInt(p.date.slice(8,10));
  const vals=sh.getRange(6,1,Math.max(sh.getLastRow()-5,1),4).getValues();
  let row=-1; for(let i=0;i<vals.length;i++) if(vals[i][0]===p.bhCode && vals[i][3]===p.branchId){ row=6+i; break; }
  if(row==-1){ row=sh.getLastRow()+1; sh.getRange(row,1).setValue(p.bhCode); sh.getRange(row,4).setValue(p.branchId); }
  const note=sh.getRange(row,dateCol).getNote();
  sh.getRange(row,dateCol).setValue(p.hours);
  if(note) sh.getRange(row,dateCol).setNote(note);
}
function upsertByBH(sh,p){
  const vals=sh.getRange(2,1,Math.max(sh.getLastRow()-1,1),1).getValues().flat();
  let row=vals.indexOf(p.bhCode); if(row==-1) row=sh.getLastRow()+1; else row=row+2;
  sh.getRange(row,1,1,3).setValues([[p.bhCode,p.hoTen,p.soTien]]);
}
function json(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function testWebhook(){ const r=setupFinanceSheets(); Logger.log(r); }
