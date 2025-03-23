import React from 'react';
import { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';

const AuthError: NextPage = () => {
  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center',
      background: 'linear-gradient(to bottom, #1a1a2e, #16213e)'
    }}>
      <Head>
        <title>Authentication Error - MiniScape</title>
      </Head>
      
      <div style={{
        padding: '2rem',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        textAlign: 'center',
        width: '90%',
        maxWidth: '400px'
      }}>
        <h1 style={{ 
          marginBottom: '1rem',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: '#ff6b6b'
        }}>
          Authentication Error
        </h1>
        
        <p style={{ 
          marginBottom: '2rem',
          color: 'rgba(255, 255, 255, 0.8)', 
          fontSize: '1rem' 
        }}>
          Sorry, there was a problem signing you in. Please try again.
        </p>
        
        <Link href="/auth/signin" passHref>
          <button
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#4285F4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            Back to Sign In
          </button>
        </Link>
      </div>
    </div>
  );
};

export default AuthError; 