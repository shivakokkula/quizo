// src/components/Register.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { FiUser, FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight } from 'react-icons/fi';
import Cookies from 'js-cookie';
import constants from '../constants';
import './Login.css'; // Reusing the same CSS file for consistent styling

const SERVER_URL = constants.SERVER_URL;

const Register = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState({
        score: 0,
        message: ''
    });
    const navigate = useNavigate();

    // Clear error when form data changes
    useEffect(() => {
        if (error) setError('');
    }, [error, formData.name, formData.email, formData.password, formData.confirmPassword]);

    // Check password strength
    useEffect(() => {
        if (formData.password) {
            const strength = checkPasswordStrength(formData.password);
            setPasswordStrength(strength);
        } else {
            setPasswordStrength({ score: 0, message: '' });
        }
    }, [formData.password]);

    const checkPasswordStrength = (password) => {
        let score = 0;
        let message = '';
        
        // Length check
        if (password.length >= 8) score += 1;
        
        // Contains number
        if (/\d/.test(password)) score += 1;
        
        // Contains special char
        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
        
        // Contains both lower and upper case
        if (/(?=.*[a-z])(?=.*[A-Z])/.test(password)) score += 1;
        
        // Set message based on score
        if (password.length === 0) {
            message = '';
        } else if (score <= 1) {
            message = 'Weak';
        } else if (score <= 2) {
            message = 'Moderate';
        } else if (score <= 3) {
            message = 'Strong';
        } else {
            message = 'Very Strong';
        }
        
        return { score, message };
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const validateForm = () => {
        if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
            setError('All fields are required');
            return false;
        }
        
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            setError('Please enter a valid email address');
            return false;
        }
        
        if (formData.password !== formData.confirmPassword) {
            setError("Passwords don't match");
            return false;
        }
        
        if (formData.password.length < 8) {
            setError('Password must be at least 8 characters long');
            return false;
        }
        
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) return;
        
        setLoading(true);
        setError('');

        try {
            // Register the user
            await axios.post(`${SERVER_URL}/register`, { 
                name: formData.name, 
                email: formData.email, 
                password: formData.password 
            });
            
            // Log in the user automatically after registration
            const loginResponse = await axios.post(
                `${SERVER_URL}/login`,
                new URLSearchParams({
                    username: formData.email,
                    password: formData.password,
                }).toString(),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );
            
            // Set the JWT token and redirect to home
            Cookies.set("jwtToken", loginResponse.data.access_token, { expires: 7 });
            setLoading(false);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.detail || 'Registration failed. Please try again.');
            setLoading(false);
        }
    };

    const getPasswordStrengthClass = () => {
        if (passwordStrength.score <= 1) return 'password-strength weak';
        if (passwordStrength.score <= 2) return 'password-strength moderate';
        if (passwordStrength.score <= 3) return 'password-strength strong';
        return 'password-strength very-strong';
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>Create an Account</h1>
                    <p>Join QuizOQ to start creating amazing quizzes</p>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="name">Full Name</label>
                        <div className="input-group">
                            <span className="input-icon">
                                <FiUser size={18} />
                            </span>
                            <input
                                id="name"
                                type="text"
                                name="name"
                                placeholder="Enter your full name"
                                value={formData.name}
                                onChange={handleChange}
                                disabled={loading}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <div className="input-group">
                            <span className="input-icon">
                                <FiMail size={18} />
                            </span>
                            <input
                                id="email"
                                type="email"
                                name="email"
                                placeholder="Enter your email"
                                value={formData.email}
                                onChange={handleChange}
                                disabled={loading}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <div className="input-group">
                            <span className="input-icon">
                                <FiLock size={18} />
                            </span>
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                name="password"
                                placeholder="Create a password"
                                value={formData.password}
                                onChange={handleChange}
                                disabled={loading}
                                required
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex="-1"
                            >
                                {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                            </button>
                        </div>
                        {formData.password && (
                            <div className="password-strength-container">
                                <div className={getPasswordStrengthClass()}>
                                    {passwordStrength.message}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <div className="input-group">
                            <span className="input-icon">
                                <FiLock size={18} />
                            </span>
                            <input
                                id="confirmPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                name="confirmPassword"
                                placeholder="Confirm your password"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                disabled={loading}
                                required
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                tabIndex="-1"
                            >
                                {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="spinner"></span>
                        ) : (
                            <>
                                Create Account <FiArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        Already have an account?{' '}
                        <Link to="/login" className="link">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;