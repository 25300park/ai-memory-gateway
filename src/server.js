require("dotenv").config();
const app = require("./app");

const port = Number(process.env.PORT || 3010);

console.log("AI Memory Gateway starting...");
console.log("NODE_ENV =", process.env.NODE_ENV || "development");
console.log("DB connection config loaded =", Boolean(
  process.env.DB_HOST &&
  process.env.DB_PORT &&
  process.env.DB_NAME &&
  process.env.DB_USER &&
  process.env.DB_PASSWORD
));
console.log("OpenAI key configured =", Boolean(process.env.OPENAI_API_KEY));

app.listen(port, () => {
  console.log(`AI Memory Gateway running on port ${port}`);
});