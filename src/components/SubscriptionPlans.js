import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import config from '../constants';
import '../styles/SubscriptionPlans.css';

// Toast notification function
const showToast = (message, type = 'info') => {
  // Simple toast implementation
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

const SubscriptionPlans = () => {
  const [loading, setLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState('free');
  const navigate = useNavigate();

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      features: [
        '2000 words per month',
        'Basic support',
        'Email assistance',
        'Limited features'
      ],
      isPopular: false
    },
    {
      id: 'basic',
      name: 'Basic',
      price: 499,
      features: [
        '10,000 words per month',
        'Priority support',
        'Email & chat assistance',
        'All basic features',
        'Cancel anytime'
      ],
      isPopular: false
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 999,
      features: [
        'Unlimited words',
        '24/7 Priority support',
        'Dedicated account manager',
        'All premium features',
        'Cancel anytime',
        'Advanced analytics'
      ],
      isPopular: true
    }
  ];

  useEffect(() => {
    // Load Razorpay script
    const loadRazorpay = () => {
      return new Promise((resolve) => {
        if (window.Razorpay) {
          resolve(window.Razorpay);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => resolve(window.Razorpay);
        script.onerror = () => {
          showToast('Failed to load payment processor', 'error');
          console.error('Razorpay SDK failed to load');
          resolve(null);
        };
        document.body.appendChild(script);
      });
    };

    loadRazorpay();
  }, []);

  const handleSubscribe = async (planId) => {
    if (loading) return;
    
    setLoading(true);
    
    try {
      // Get token from localStorage and verify it exists
      const token = localStorage.getItem('jwtToken');
      if (!token) {
        showToast('Please log in to subscribe', 'error');
        navigate('/login');
        return;
      }

      // 1. Create order on the server
      const orderResponse = await axios.post(
        `${config.SERVER_URL}/api/subscription/create-order`,
        { plan_id: planId },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          withCredentials: true
        }
      );

      if (!orderResponse.data) {
        throw new Error('Invalid response from server');
      }

      const { order_id, amount, currency } = orderResponse.data;
      const plan = plans.find(p => p.id === planId);

      // 2. Initialize Razorpay
      const options = {
        key: config.REACT_APP_RAZORPAY_KEY_ID || 'your_razorpay_key_here',
        amount: amount.toString(),
        currency: currency || 'INR',
        name: 'QuizOQ',
        description: `Subscription for ${plan?.name} plan`,
        order_id: order_id,
        handler: async function (response) {
          try {
            // 3. Verify payment on the server
            await axios.post(
              `${config.SERVER_URL}/api/subscription/verify-payment`,
              {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                plan_id: planId
              },
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                withCredentials: true
              }
            );
            
            showToast('Subscription successful!', 'success');
            setCurrentPlan(planId);
            navigate('/dashboard');
          } catch (error) {
            console.error('Payment verification failed:', error);
            showToast(
              error.response?.data?.detail || 'Payment verification failed. Please contact support.',
              'error'
            );
          }
        },
        prefill: {
          name: localStorage.getItem('userName') || '',
          email: localStorage.getItem('userEmail') || ''
        },
        theme: {
          color: '#4f46e5'
        },
        modal: {
          ondismiss: function() {
            showToast('Payment window closed', 'info');
          }
        }
      };

      // 4. Open Razorpay payment modal
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error('Subscription error:', error);
      showToast(
        error.response?.data?.detail || 'Failed to process subscription',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="subscription-plans-container">
      <div className="subscription-header">
        <h1>Choose Your Plan</h1>
        <p>Select the plan that best fits your needs</p>
      </div>
      
      <div className="plans-grid">
        {plans.map((plan) => (
          <div 
            key={plan.id} 
            className={`plan-card ${plan.isPopular ? 'popular' : ''} ${currentPlan === plan.id ? 'current-plan' : ''}`}
          >
            {plan.isPopular && <div className="popular-badge">Most Popular</div>}
            {currentPlan === plan.id && <div className="current-badge">Current Plan</div>}
            
            <h3>{plan.name}</h3>
            <div className="price">
              <span className="amount">
                ₹{plan.price === 0 ? '0' : plan.price.toLocaleString()}
              </span>
              <span className="period">/month</span>
            </div>
            
            <ul className="features">
              {plan.features.map((feature, index) => (
                <li key={index}>
                  <svg className="feature-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            
            <button
              className={`btn-subscribe ${currentPlan === plan.id ? 'current' : ''}`}
              onClick={() => handleSubscribe(plan.id)}
              disabled={loading || currentPlan === plan.id}
            >
              {loading ? 'Processing...' : 
               currentPlan === plan.id ? 'Current Plan' : 
               plan.price === 0 ? 'Current Plan' : 'Subscribe Now'}
            </button>
          </div>
        ))}
      </div>
      
      <div className="subscription-info">
        <h3>Frequently Asked Questions</h3>
        <div className="faq">
          <div className="faq-item">
            <h4>Can I change my plan later?</h4>
            <p>Yes, you can upgrade or downgrade your plan at any time. The changes will be reflected in your next billing cycle.</p>
          </div>
          <div className="faq-item">
            <h4>Is there a free trial?</h4>
            <p>Yes, you can start with our free plan which includes 2000 words per month. No credit card required.</p>
          </div>
          <div className="faq-item">
            <h4>How does the billing work?</h4>
            <p>All plans are billed monthly. Your subscription will automatically renew each month until you cancel.</p>
          </div>
          <div className="faq-item">
            <h4>Can I cancel anytime?</h4>
            <p>Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPlans;
