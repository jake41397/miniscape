import React, { useEffect } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Head from 'next/head';

const SignIn: NextPage = () => {
  const { signInWithGoogle, session } = useAuth();
  const router = useRouter();
  
  // Redirect to home if already authenticated
  useEffect(() => {
    if (session) {
      router.push('/');
    }
  }, [session, router]);
  
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
        <title>Sign In - MiniScape</title>
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
          marginBottom: '2rem',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: 'white'
        }}>
          Welcome to MiniScape
        </h1>
        
        <p style={{ 
          marginBottom: '2rem',
          color: 'rgba(255, 255, 255, 0.8)', 
          fontSize: '1rem' 
        }}>
          A multiplayer browser-based RPG inspired by RuneScape
        </p>
        
        <button 
          onClick={() => signInWithGoogle()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#4285F4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            width: '100%',
            marginBottom: '1rem'
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>
            {/* Google logo can be added here */}
            G
          </span>
          Sign in with Google
        </button>
        
        <p style={{ 
          fontSize: '0.8rem',
          color: 'rgba(255, 255, 255, 0.6)',
          marginTop: '1rem'
        }}>
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default SignIn; 