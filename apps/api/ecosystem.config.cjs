module.exports = {
  apps: [
    {
      name: "markup-api",
      cwd: __dirname,
      script: ".venv/bin/uvicorn",
      args: "app.main:app --host 0.0.0.0 --port 8610",
      interpreter: "none",
      env: {
        ENVIRONMENT: "local",
      },
    },
  ],
};
