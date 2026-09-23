import React from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './logo';
function AuthPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #eab676, #f5d3a2)',
    }}>
      
      <div style={{
        width: '90%',
        maxWidth: '400px',
        padding: '40px',
        borderRadius: '15px',
        backgroundColor: 'white',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: '20px' }}>
            <Logo/>
        </div>
        
        <h1 style={{ marginBottom: '30px', color: '#333' }}>
          Welcome
        </h1>

        <button
          onClick={() => navigate('/login')}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '15px',
            fontSize: '16px',
            backgroundColor: '#eab676',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Login
        </button>

        <button
          onClick={() => navigate('/registeruser')}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          New User
        </button>

      </div>
    </div>
  );
}

export default AuthPage;