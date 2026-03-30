import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/snark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'hello',
        history: [],
        context: {}
      })
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body:', text.substring(0, 100));
  } catch (e) {
    console.error(e);
  }
}

test();
