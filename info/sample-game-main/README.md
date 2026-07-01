# BGaming Publishing sample game

**NOTE:** this is just sample to show basics and has many simplifications

## Running on dev

### 1) Download & start local runner(runner_cli)

```sh
runner_cli -c config.yml
```

### 2) Start backend in separate terminal

```sh
cd backend
npm install
npm run dev
```

### 3) Start frontend in separate terminal

```sh
cd frontend
npm install
npm run dev
```

### 4) Profit!

Open `http://localhost:5173/?token=fda1091b1c7349e8dbcc4c2d6fd89926` and click 'Spin'

### 5) Play with cheats

1) Open `http://localhost:4000`
2) Click on `God mode` button in the table
3) Paste `[{"random": 2}, {"random": 2}, {"random": 2}, {"random": 1}, {"random": 1}]` in input
4) Click save
5) Return to game: `http://localhost:5173/?token=fda1091b1c7349e8dbcc4c2d6fd89926`
6) Play. You must have 3 win rounds and then 2 loses

For more information see documentation

## Bulding for production

Example Dockerfiles are provided for frontend/backend.
