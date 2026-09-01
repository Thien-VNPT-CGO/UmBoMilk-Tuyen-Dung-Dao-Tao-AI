// scripts/migrate.js - Tự động hoá migrate JSON -> Postgres realtime
// Chạy: node scripts/migrate.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'db.json');

async function main(){
  if(!fs.existsSync(DATA_FILE)){
    console.error('Không tìm thấy db.json');
    process.exit(1);
  }
  const db = JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
  console.log(`Employees: ${db.employees.length}, Applicants: ${db.applicants.length}, Attendances: ${db.attendances.length}`);

  if(!process.env.DATABASE_URL){
    console.log('Chưa có DATABASE_URL - tạo .env DATABASE_URL=postgresql://umb:changeme@localhost:5432/umb_milk');
    console.log('Sau đó chạy: npx prisma migrate dev && node scripts/migrate.js --execute');
    return;
  }

  if(process.argv.includes('--execute')){
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    console.log('Migrating...');
    // Batch insert với transaction
    await prisma.$transaction([
      prisma.employee.createMany({ data: db.employees.map(e=>({
        employeeId: e.employeeId, name: e.name, phone: e.phone, branchId: e.branchId, shift: e.shift, status: e.status, type: e.type, category: e.category
      })), skipDuplicates: true })
    ]);
    console.log('Done');
    await prisma.$disconnect();
  }
}

main();
