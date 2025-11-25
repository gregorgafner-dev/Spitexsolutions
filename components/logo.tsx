'use client'

import React, { useState } from 'react'

interface LogoProps {
  className?: string
  showTagline?: boolean
}

export function Logo({ className = '', showTagline = true }: LogoProps) {
  const [imageError, setImageError] = useState(false)

  return (
    <div className={`flex flex-col items-center justify-center w-full overflow-visible ${className}`}>
      {!imageError ? (
        <img 
          src="/logo.png" 
          alt="Spitex Solutions" 
          className="h-48 md:h-64 w-auto object-contain mb-3"
          style={{ maxHeight: '256px' }}
          onError={() => {
            console.error('Logo-Bild konnte nicht geladen werden')
            setImageError(true)
          }}
          onLoad={() => {
            console.log('Logo-Bild erfolgreich geladen')
            setImageError(false)
          }}
        />
      ) : (
        <>
          <h1 
            className="text-4xl md:text-5xl font-serif text-blue-900 mb-3 whitespace-nowrap" 
            style={{ 
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 'normal',
              lineHeight: '1.2'
            }}
          >
            Spitex Domus
          </h1>
          {showTagline && (
            <p 
              className="text-sm md:text-base text-blue-400 font-light whitespace-nowrap mt-1" 
              style={{ 
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontWeight: 300,
                lineHeight: '1.5',
                display: 'block'
              }}
            >
              persönlich, freundlich und kompetent
            </p>
          )}
        </>
      )}
    </div>
  )
}

