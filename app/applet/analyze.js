const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

// Assuming data contains: novidades, banners, cursos, materiais, etc.
// Let's print the keys first
console.log(Object.keys(data));

const cursos = data.cursos || [];
const materiais = data.materiais || [];
// Let's fetch fenix social posts
// Since we don't have them in public content, maybe we can fetch them?
