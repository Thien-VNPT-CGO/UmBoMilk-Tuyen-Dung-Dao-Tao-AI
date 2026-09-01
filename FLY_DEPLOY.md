# Fly.io - Deploy 24/7 Realtime (Singapore)

> App: `umbomilk-hr-thien-cgo` - Region `sin` - Health `/health` - Auto 24/7 (min_machines_running=1)

## 1. Chuẩn bị 1 lần (2 phút)
```bash
# Cài flyctl
curl -L https://fly.io/install.ps1 | pwsh  # Windows
# hoặc npm: npm i -g flyctl

flyctl auth login
flyctl apps create umbomilk-hr-thien-cgo --org personal  # nếu báo đã tồn tại đổi tên trong fly.toml
flyctl secrets set JWT_SECRET=c31341534b72968290550dc6e1325b169cee546cbd639a7180bc8e6658353edb49a06793d5f806c1245372472bd5013f SECRET_ENCRYPTION_KEY=c31341534b72968290550dc6e1325b169cee546cbd639a7180bc8e6658353edb49 ALLOWED_ORIGINS=https://umbomilk-hr-thien-cgo.fly.dev -a umbomilk-hr-thien-cgo
```

## 2. Deploy thủ công lần đầu
```bash
cd "um-bo-milk-app"
flyctl deploy --remote-only
flyctl open  # https://umbomilk-hr-thien-cgo.fly.dev/health
flyctl logs
```

## 3. Auto deploy từ GitHub (đã có .github/workflows/deploy.yml)
```bash
# Tạo token
flyctl auth token  # copy token
# Vào GitHub: https://github.com/Thien-VNPT-CGO/UmBoMilk-Tuyen-Dung-Dao-Tao-AI/settings/secrets/actions
# New secret: Name=FLY_API_TOKEN Value=<token>
# Sau đó mỗi git push lên main sẽ tự deploy
```

## 4. Postgres (khuyên dùng cho 24/7)
```bash
flyctl postgres create --name umbomilk-db --region sin --vm-size shared-cpu-1x --volume-size 10
flyctl postgres attach umbomilk-db -a umbomilk-hr-thien-cgo
# DATABASE_URL sẽ tự inject, chạy migrate:
flyctl ssh console -a umbomilk-hr-thien-cgo -C "npx prisma migrate deploy"
```

## 5. Kiểm tra realtime 24/7
- `https://umbomilk-hr-thien-cgo.fly.dev/health` → {"status":"ok"}
- `https://umbomilk-hr-thien-cgo.fly.dev/api/health` → realtime:true
- Socket: wss://umbomilk-hr-thien-cgo.fly.dev (auto_stop=false nên không ngủ)
