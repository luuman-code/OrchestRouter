// Utils task: Authentication utilities
async function authenticateUser(credentials) {
  // Simulate API call
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });

  if (response.ok) {
    return response.json();
  } else {
    throw new Error('Authentication failed');
  }
}

function storeAuthToken(token) {
  localStorage.setItem('authToken', token);
}