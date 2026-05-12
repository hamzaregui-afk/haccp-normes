const b = require('/app/services/auth-service/node_modules/bcrypt');
b.hash('Password1!', 10).then(h => { console.log(h); process.exit(0); });
