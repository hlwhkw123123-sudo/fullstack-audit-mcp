app.post("/api/users", (req, _res) =>
  db.query("SELECT * FROM users WHERE id=" + req.body.id),
);
