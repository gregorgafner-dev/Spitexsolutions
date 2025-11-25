'use client'

import React, { useState } from 'react'

interface LogoSmallProps {
  className?: string
}

export function LogoSmall({ className = '' }: LogoSmallProps) {
  const [imageError, setImageError] = useState(false)

  return (
    <div className={`flex items-center justify-end ${className}`}>
      {!imageError ? (
        <img 
          src="/logo.png" 
          alt="Spitex Solutions" 
          className="h-6 w-auto object-contain"
          style={{ maxHeight: '24px', maxWidth: '120px' }}
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
        // SVG-Logo als Fallback
        <svg
          width="80"
          height="20"
          viewBox="0 0 80 20"
          className="h-5 w-auto"
          style={{ maxHeight: '20px' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <text
            x="0"
            y="15"
            fontSize="12"
            fontFamily="Georgia, 'Times New Roman', serif"
            fill="#1e40af"
            fontWeight="normal"
            opacity="0.9"
          >
            Spitex Domus
          </text>
        </svg>
      )}
    </div>
  )
}


