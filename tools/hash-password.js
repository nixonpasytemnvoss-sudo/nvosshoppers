'use strict';
/* Convierte la contraseña del panel en un valor cifrado (scrypt) para no guardarla en claro.
   Uso:  node tools/hash-password.js "una frase larga que solo tú conozcas"
   Copia la línea que imprime a las variables del servidor y borra ADMIN_PASSWORD. */
const crypto = require('crypto');
const pw = process.argv[2];
if (!pw || pw.length < 14) { console.error('Uso: node tools/hash-password.js "tu frase de al menos 14 caracteres"'); process.exit(1); }
const salt = crypto.randomBytes(16);
console.log('ADMIN_PASSWORD_HASH=scrypt:' + salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'));
