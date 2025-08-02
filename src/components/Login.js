// src/components/Login.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { FiMail, FiLock, FiEye, FiEyeOff, FiLogIn, FiArrowRight } from "react-icons/fi";
import Cookies from "js-cookie";
import constants from "../constants";
import "./Login.css";

const SERVER_URL = constants.SERVER_URL;

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  // Clear error when email/password changes
  useEffect(() => {
    if (error) setError("");
  }, [email, password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    // Basic validation
    if (!email || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(
        `${SERVER_URL}/login`,
        new URLSearchParams({
          username: email,
          password: password,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      
      Cookies.set("jwtToken", response.data.access_token, { expires: 7 }); // Expires in 7 days
      setLoading(false);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid email or password. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError("");
    
    try {
      const response = await axios.post(
        `${SERVER_URL}/google-login`,
        { token_id: credentialResponse.credential },
        { headers: { "Content-Type": "application/json" } }
      );
      
      Cookies.set("jwtToken", response.data.access_token, { expires: 7 });
      setLoading(false);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || "Google login failed. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleFailure = () => {
    setError("Google login was unsuccessful. Please try again.");
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Welcome Back</h1>
          <p>Sign in to continue to QuizOQ</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-group">
              <span className="input-icon">
                <FiMail size={18} />
              </span>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="form-header">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password" className="forgot-password">
                Forgot password?
              </Link>
            </div>
            <div className="input-group">
              <span className="input-icon">
                <FiLock size={18} />
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                Sign In <FiArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="divider">
          <span>OR</span>
        </div>

        <div className="social-login">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleFailure}
            useOneTap={true}
            theme="filled_blue"
            size="large"
            shape="rectangular"
            text="signin_with"
            width="100%"
          />
        </div>

        <div className="auth-footer">
          <p>
            Don't have an account?{" "}
            <Link to="/register" className="link">
              Sign up now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
