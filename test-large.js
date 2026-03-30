import fetch from 'node-fetch';

async function test() {
  try {
    const games = Array(100).fill(0).map((_, i) => ({
      id: `game-${i}`,
      awayTeam: 'Team A',
      homeTeam: 'Team B',
      league: 'NBA'
    }));
    const predictions = {};
    for (let i = 0; i < 100; i++) {
      predictions[`game-${i}`] = {
        winner: 'Team A',
        confidence: 8,
        reasoning: 'Because I said so. '.repeat(50)
      };
    }

    const res = await fetch('http://localhost:3000/api/snark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'hello',
        history: [],
        context: { games, predictions }
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
