const urls = [
  'http://localhost:3000/',
  'http://localhost:3000/src/main.tsx',
  'http://localhost:3000/src/index.css',
  'http://localhost:3000/src/providers/trpc.tsx',
  'http://localhost:3000/src/providers/LanguageContext.tsx',
  'http://localhost:3000/src/providers/AuthContext.tsx',
  'http://localhost:3000/src/lib/offlineSync.ts',
  'http://localhost:3000/src/App.tsx',
  'http://localhost:3000/src/pages/Home.tsx',
  'http://localhost:3000/src/pages/Audit.tsx',
  'http://localhost:3000/src/pages/Admin.tsx',
  'http://localhost:3000/sw.js',
  'http://localhost:3000/manifest.webmanifest'
];

async function check() {
  for (const u of urls) {
    try {
      const res = await fetch(u);
      const text = await res.text();
      console.log(`${res.status} [${text.length}b] - ${u}`);
      if (res.status !== 200) {
        console.error(`ERROR on ${u}: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`FETCH FAILED for ${u}:`, err.message);
    }
  }
}
check();
