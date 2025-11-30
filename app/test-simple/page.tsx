'use client'

export default function TestSimplePage() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>Einfacher Test</h1>
      <p>Wenn Sie das sehen, funktioniert die Seite!</p>
      <button 
        onClick={() => {
          console.log('Button wurde geklickt!')
          alert('Button funktioniert!')
        }}
        style={{ 
          padding: '10px 20px', 
          fontSize: '16px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
      >
        Klicken Sie mich
      </button>
      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0' }}>
        <h2>Console Check:</h2>
        <p>Öffnen Sie die Browser-Konsole (F12) und prüfen Sie:</p>
        <ul>
          <li>Gibt es rote Fehlermeldungen?</li>
          <li>Wird "Button wurde geklickt!" geloggt, wenn Sie den Button klicken?</li>
        </ul>
      </div>
    </div>
  )
}

