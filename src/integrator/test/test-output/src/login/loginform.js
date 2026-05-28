// Config task: Module configuration

import {  } from 'react';

const LOGIN_CONFIG = {
  maxAttempts: 3,
  timeout: 30000,
  requireCaptcha: true
};

function initializeConfig() {
  console.log('Configuration initialized');
}
// Validation task: Login validation functions
function validateEmail(email) {
  return /^[^@]+@[^@]+\.[^@]+$/.test(email);
}

function validatePassword(password) {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

function validateLoginForm(data) {
  return {
    email: validateEmail(data.email),
    password: validatePassword(data.password),
    isValid: validateEmail(data.email) && validatePassword(data.password)
  };
}
// Component task: React LoginForm component
import React, { useState } from 'react';

function LoginForm({ onSubmit }) {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    const validation = validateLoginForm(formData);
    if (validation.isValid) {
      onSubmit(formData);
    } else {
      setErrors(validation);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({...formData, email: e.target.value})}
        placeholder="Email"
      />
      <input
        type="password"
        value={formData.password}
        onChange={(e) => setFormData({...formData, password: e.target.value})}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
}