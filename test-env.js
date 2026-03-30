import "dotenv/config";
console.log(process.env.OPENAI_API_KEY ? 'Set: ' + process.env.OPENAI_API_KEY.substring(0, 5) : 'Not set');
