import logging
import os
import hashlib
import uuid
import tempfile
import speech_recognition as sr
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timezone
import pytz
import json

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Supabase Client import needs to be here to use os.getenv directly without Config.SUPABASE_URL
from supabase import create_client, Client

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import our modules
from config import Config
from database.supabase_client import SupabaseClient
from ai_models.disease_predictor import DiseasePredictor
from ai_models.image_analyzer import ImageAnalyzer
from ai_models.ocr_processor import OCRProcessor
from services.ipfs_service import IPFSService
from services.emergency_service import EmergencyService
from services.analytics_service import AnalyticsService
from backend.anemia_detection import AnemiaDetector
from utils.validators import validate_patient_data, validate_medical_record
from utils.encryption import encrypt_sensitive_data, decrypt_sensitive_data


# Initialize Flask app
app = Flask(__name__)
app.config.from_object(Config)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://192.168.0.108:5000"], "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

# Initialize services
db = SupabaseClient()
disease_predictor = DiseasePredictor()
image_analyzer = ImageAnalyzer()
ocr_processor = OCRProcessor()
ipfs_service = IPFSService(app.config['PINATA_API_KEY'], app.config['PINATA_SECRET_KEY'], app.config['PINATA_GATEWAY_URL'])
emergency_service = EmergencyService()
analytics_service = AnalyticsService()
anemia_detector = AnemiaDetector()

# Define the Pinata Gateway URL for direct access to content
# PINATA_GATEWAY_URL = app.config['PINATA_GATEWAY_URL'] # Get from Config

# --- Load ML Models ---
try:
    # Heart Disease Prediction Model
    heart_disease_model = joblib.load("test_models/heart_disease_model.joblib")
    heart_scaler = joblib.load("test_models/heart_scaler.joblib")
    
    # Medical Condition Prediction Model
    medical_condition_model = joblib.load("test_models/medical_condition_model.joblib")
    medical_label_encoders = joblib.load("test_models/label_encoders.joblib")

    # Cancer Prediction Model
    cancer_model = joblib.load("test_models/cancer_model.joblib")
    cancer_scaler = joblib.load("test_models/cancer_scaler.joblib")
    logger.info(f"Cancer scaler loaded: {cancer_scaler is not None}")

    # Diabetes Prediction Model
    diabetes_model = joblib.load("test_models/diabetes_model.joblib")
    diabetes_scaler = joblib.load("test_models/diabetes_scaler.joblib")
    diabetes_class_encoder = joblib.load("test_models/diabetes_class_encoder.joblib")
    diabetes_gender_encoder = joblib.load("test_models/gender_encoder.joblib") # Assuming this is for diabetes

    # Kidney Stone Detection Model
    kidney_model = joblib.load("test_models/kidney_model.joblib")
    kidney_scaler = joblib.load("test_models/kidney_model_scaler.joblib")

    logger.info("All ML models loaded successfully.")
except Exception as e:
    logger.error(f"Error loading ML models: {e}")
    # Temporarily setting these to None if they fail to load to allow the app to start.
    # In a production environment, you would handle this more robustly, e.g., by disabling routes.
    heart_disease_model = None
    heart_scaler = None
    medical_condition_model = None
    medical_label_encoders = None
    cancer_model = None
    cancer_scaler = None
    diabetes_model = None
    diabetes_scaler = None
    diabetes_class_encoder = None
    diabetes_gender_encoder = None
    kidney_model = None
    kidney_scaler = None

# Allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'dcm'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ==================== AUTHENTICATION ROUTES ====================

# Helper function to generate a consistent dummy email and password from wallet address
def generate_dummy_credentials(wallet_address: str):
    # Using SHA224 to create a deterministic password that fits Supabase's length limits
    # Generate a more email-friendly local part from the wallet address
    hash_part = hashlib.sha256(wallet_address.encode('utf-8')).hexdigest()[:20] # Take first 20 chars of SHA256
    email = f"wallet_{hash_part}@healthai.com"
    # SHA224 produces a 56-character hex string, which is < 72 characters
    password = hashlib.sha224(wallet_address.encode('utf-8')).hexdigest()
    return email, password

@app.route('/api/auth/wallet-login', methods=['POST'])
def wallet_login():
    """Authenticate user with crypto wallet"""
    try:
        data = request.get_json()
        wallet_address = data.get('wallet_address')
        signature = data.get('signature')
        
        if not wallet_address or not signature:
            return jsonify({'error': 'Wallet address and signature required'}), 400

        # In a real application, you would verify the signature here against the wallet_address
        # For this simplified approach, we'll assume the signature is valid if received.
        logger.info(f"Received wallet login request for address: {wallet_address}")

        user_in_db = db.get_user_by_wallet(wallet_address)
        user_id_to_use = None

        if not user_in_db:
            # User does not exist, create a new entry in public.users
            new_user_id = str(uuid.uuid4()) # Generate a new UUID for the user
            user_data = {
                'id': new_user_id,
                'wallet_address': wallet_address,
                'created_at': datetime.utcnow().isoformat(),
                'role': 'patient',  # Default role for new wallet users
                'is_verified': True # Assuming wallet authentication implies verification
            }
            created_user = db.create_user(user_data)
            if not created_user:
                logger.error(f"Failed to create user in public.users table for wallet {wallet_address}.")
                return jsonify({'error': 'Failed to create user record.'}), 500
            user_in_db = created_user
            user_id_to_use = new_user_id
            logger.info(f"New user created in public.users for wallet {wallet_address} with ID {new_user_id}.")
        else:
            # User exists, use their existing ID
            user_id_to_use = user_in_db['id']
            logger.info(f"Existing user found for wallet {wallet_address} with ID {user_id_to_use}.")

        # Generate a simple application-level session token (e.g., a new UUID)
        # This token is distinct from Supabase Auth's JWTs
        app_access_token = str(uuid.uuid4())
        app_refresh_token = str(uuid.uuid4()) # Use a separate refresh token for completeness

        # Create or update session in your 'user_sessions' table
        success_session = db.create_session(user_id_to_use, app_access_token, app_refresh_token)
        if not success_session:
            logger.error(f"Failed to create or update user session for user ID {user_id_to_use}.")
            return jsonify({'error': 'Failed to create or update user session.'}), 500
        
        logger.info(f"Session created for user ID {user_id_to_use}.")
        
        return jsonify({
            'success': True,
            'user': user_in_db,
            'token': app_access_token,
            'refresh_token': app_refresh_token
        })
        
    except Exception as e:
        logger.error(f"Wallet login error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Authentication failed'}), 500

@app.route('/api/auth/register', methods=['POST'])
def register_user():
    """Register new user with additional details"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['wallet_address', 'name', 'email', 'role']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Check if user already exists
        existing_user = db.get_user_by_wallet(data['wallet_address'])
        if existing_user:
            return jsonify({'error': 'User already exists!'}), 409
        
        # Encrypt sensitive data
        encrypted_email = encrypt_sensitive_data(data['email'])
        
        user_data = {
            'wallet_address': data['wallet_address'],
            'name': data['name'],
            'email': encrypted_email,
            'role': data['role'],
            'specialization': data.get('specialization'),
            'license_number': data.get('license_number'),
            'hospital': data.get('hospital'),
            'created_at': datetime.utcnow().isoformat(),
            'is_verified': data['role'] == 'patient'  # Patients auto-verified, doctors need verification
        }
        
        user = db.create_user(user_data)
        
        return jsonify({
            'success': True,
            'user': user,
            'message': 'User registered successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Registration error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Registration failed'}), 500

# ==================== AI DIAGNOSIS ROUTES ====================

@app.route('/api/ai/symptom-analysis', methods=['POST'])
def analyze_symptoms():
    """Analyze symptoms using AI models"""
    try:
        # Check authentication
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({
                'error': 'Authentication required',
                'redirect': '/auth/login'
            }), 401
        
        data = request.get_json()
        
        symptoms = data.get('symptoms', '')
        duration = data.get('duration', '')
        severity = data.get('severity', 5)
        medical_history = data.get('medical_history', [])
        vital_signs = data.get('vital_signs', {})
        
        if not symptoms:
            return jsonify({'error': 'Symptoms description required'}), 400
        
        # Prepare input for AI model
        input_text = f"Symptoms: {symptoms}. Duration: {duration}. Severity: {severity}/10. Medical History: {', '.join(medical_history)}. Vital Signs: Heart Rate: {vital_signs.get('heart_rate', 'N/A')}, BP: {vital_signs.get('blood_pressure_systolic', 'N/A')}/{vital_signs.get('blood_pressure_diastolic', 'N/A')}, Temp: {vital_signs.get('temperature', 'N/A')}."
        
        diagnosis_result = disease_predictor.predict_disease_from_symptoms(input_text)
        
        if diagnosis_result:
            return jsonify(diagnosis_result), 200
        else:
            return jsonify({'error': 'AI diagnosis failed or returned no results.'}), 500
            
    except Exception as e:
        logger.error(f"Symptom analysis error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error during symptom analysis'}), 500

@app.route('/api/ai/image-diagnosis', methods=['POST'])
def image_diagnosis():
    """Perform medical image diagnosis using AI models."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        file = request.files['image']
        diagnosis_type = request.form.get('diagnosis_type', 'general') # Default to 'general'

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_extension = filename.rsplit('.', 1)[1].lower()

            temp_dir = tempfile.mkdtemp()
            temp_filepath = os.path.join(temp_dir, filename)
            file.save(temp_filepath)

            result = None
            if diagnosis_type == 'eye_anemia':
                # Use the AnemiaDetector service for eye_anemia diagnosis
                result = anemia_detector.detect_anemia_from_eye_image(temp_filepath)
            else:
                # Default to general image analysis if no specific type or type not recognized
                result = image_analyzer.analyze_image(temp_filepath)

            os.remove(temp_filepath)
            os.rmdir(temp_dir)

            if result:
                return jsonify(result), 200
            else:
                return jsonify({'error': 'Image analysis failed or returned no results.'}), 500
        else:
            return jsonify({'error': 'Invalid file type.'}), 400
    except Exception as e:
        logger.error(f"Image diagnosis error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error during image diagnosis'}), 500

@app.route('/api/ai/ocr-analysis', methods=['POST'])
def ocr_analysis():
    """Perform OCR on medical documents."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        if 'document' not in request.files:
            return jsonify({'error': 'No document file provided'}), 400

        file = request.files['document']

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            temp_dir = tempfile.mkdtemp()
            temp_filepath = os.path.join(temp_dir, filename)
            file.save(temp_filepath)

            extracted_text = ocr_processor.process_document(temp_filepath)

            os.remove(temp_filepath)
            os.rmdir(temp_dir)

            if extracted_text:
                return jsonify({'success': True, 'extracted_text': extracted_text}), 200
            else:
                return jsonify({'error': 'OCR failed to extract text.'}), 500
        else:
            return jsonify({'error': 'Invalid file type.'}), 400
    except Exception as e:
        logger.error(f"OCR analysis error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error during OCR analysis'}), 500

@app.route('/api/ml-diagnosis', methods=['POST'])
def ml_diagnosis():
    """Predict medical conditions using various ML models based on structured input."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        if not user_session:
            return jsonify({'error': 'Invalid authentication token.'}), 401

        data = request.get_json()
        model_name = data.get('model_name')
        input_data = data.get('input_data')

        if not model_name or not input_data:
            return jsonify({'error': 'Missing model_name or input_data'}), 400

        prediction_result = None

        if model_name == "heart_disease":
            if heart_disease_model and heart_scaler:
                # Define all expected features for the heart disease model, in the exact order they were trained.
                expected_features_order = [
                    "age", "sex", "cp", "trestbps", "chol", "fbs", "restecg",
                    "thalach", "exang", "oldpeak", "slope", "ca", "thal"
                ]

                # Prepare input_data dictionary, ensuring all expected features are present
                processed_input_data = {}
                for feature in expected_features_order:
                    value = input_data.get(feature) # Get value

                    if feature in ["sex", "fbs", "exang", "ca", "thal", "cp", "restecg", "slope"]:
                        try:
                            processed_input_data[feature] = int(value) if value is not None else 0
                        except (ValueError, TypeError):
                            processed_input_data[feature] = 0 
                    else:
                        try:
                            processed_input_data[feature] = float(value) if value is not None else 0.0
                        except (ValueError, TypeError):
                            processed_input_data[feature] = 0.0 

                # Create DataFrame ensuring columns are in the exact expected order.
                df = pd.DataFrame([processed_input_data], columns=expected_features_order)

                # Apply scaler to the entire DataFrame. The scaler will internally handle which columns it scales
                # if it was fitted on the full DataFrame, resolving the feature name mismatch.
                df_scaled = heart_scaler.transform(df)
                
                prediction_proba = heart_disease_model.predict_proba(df_scaled)[0][1] # Probability of heart disease
                prediction_class = (prediction_proba > 0.5).astype(int) # 0 or 1
                
                condition = "Heart Disease" if prediction_class == 1 else "No Heart Disease"
                recommendations = ["Consult a cardiologist.", "Maintain a healthy lifestyle.", "Regular check-ups."] if prediction_class == 1 else ["Continue healthy habits.", "Regular check-ups."]
                urgency = "High" if prediction_class == 1 else "Low"
                next_steps = ["Schedule an appointment with a heart specialist."] if prediction_class == 1 else ["Monitor diet and exercise."]

                prediction_result = {
                    "condition": condition,
                    "confidence": round(prediction_proba * 100, 2),
                    "category": "Cardiology",
                    "recommendations": recommendations,
                    "urgency": urgency,
                    "next_steps": next_steps
                }
            else:
                return jsonify({'error': 'Heart disease model not loaded.'}), 503
        
        elif model_name == "medical_condition":
            if medical_condition_model and medical_label_encoders:
                df = pd.DataFrame([input_data])
                # No specific scaling mentioned for medical_condition_model in the initial setup,
                # assuming direct use or handled internally by the model/training script.
                # If label encoders were used for features, apply them here.
                # For example:
                # for col, encoder in medical_label_encoders.items():
                #     if col in df.columns:
                #         df[col] = encoder.transform(df[col])

                prediction = medical_condition_model.predict(df)[0]
                prediction_proba = medical_condition_model.predict_proba(df).max() * 100

                # Assuming medical_condition_model outputs a numerical label that needs mapping
                # This needs to be adjusted based on how your medical_condition_model was trained and what it outputs.
                # For now, a placeholder mapping:
                condition_map = {0: "Mild Condition", 1: "Moderate Condition", 2: "Severe Condition"}
                condition = condition_map.get(prediction, "Unknown Condition")
                
                prediction_result = {
                    "condition": condition,
                    "confidence": round(prediction_proba, 2),
                    "category": "General Medicine",
                    "recommendations": ["Consult a general physician for further assessment."],
                    "urgency": "Medium",
                    "next_steps": ["Schedule a follow-up appointment."]
                }
            else:
                return jsonify({'error': 'Medical condition model not loaded.'}), 503

        elif model_name == "cancer_prediction":
            if cancer_model and cancer_scaler:
                # Define all expected features for the cancer model, in the exact order they were trained.
                # This is critical for scikit-learn models and scalers to avoid feature mismatch errors.
                expected_features_order = [
                    'Age', 'Gender', 'BMI', 'Smoking', 'GeneticRisk', 
                    'PhysicalActivity', 'AlcoholIntake', 'CancerHistory'
                ]
                
                # Prepare input_data dictionary, ensuring all expected features are present
                # and their values are in the correct format (e.g., 0/1 for binary, float for numerical).
                processed_input_data = {}
                for feature in expected_features_order:
                    value = input_data.get(feature) # Get value, default will be None if not found

                    if feature == 'Gender':
                        # Convert 'male' to 0, 'female' to 1. Default to 0 if not specified or invalid.
                        processed_input_data[feature] = 1 if str(value).lower() == 'female' else 0
                    elif feature in ['Smoking', 'GeneticRisk', 'CancerHistory']:
                        # Convert boolean/truthy values to 1, falsy to 0. Default to 0.
                        processed_input_data[feature] = 1 if bool(value) else 0
                    else:
                        # For numerical features, attempt conversion to float. Default to 0.0 if invalid.
                        try:
                            processed_input_data[feature] = float(value) if value is not None else 0.0
                        except (ValueError, TypeError):
                            processed_input_data[feature] = 0.0 # Fallback for invalid numerical input

                # Create DataFrame ensuring columns are in the exact expected order.
                df = pd.DataFrame([processed_input_data], columns=expected_features_order)

                # The scaler was fitted on the entire DataFrame including categorical features.
                # Therefore, we pass the entire DataFrame for transformation.
                # The scaler will internally handle which columns it scales.
                df_scaled = cancer_scaler.transform(df)
                
                # The model expects input with the same number of features as the scaled data.
                prediction_proba = cancer_model.predict_proba(df_scaled)[0][1] # Probability of cancer
                prediction_class = (prediction_proba > 0.5).astype(int)

                condition = "High Risk of Cancer" if prediction_class == 1 else "Low Risk of Cancer"
                recommendations = ["Consult an oncologist for screening and early detection.", "Adopt healthy lifestyle changes."] if prediction_class == 1 else ["Maintain healthy lifestyle.", "Regular check-ups."]
                urgency = "High" if prediction_class == 1 else "Low"
                next_steps = ["Discuss personalized screening options with a specialist."] if prediction_class == 1 else ["Continue monitoring and healthy living."]

                prediction_result = {
                    "condition": condition,
                    "confidence": round(prediction_proba * 100, 2),
                    "category": "Oncology",
                    "recommendations": recommendations,
                    "urgency": urgency,
                    "next_steps": next_steps
                }
            else:
                return jsonify({'error': 'Cancer prediction model not loaded.'}), 503

        elif model_name == "diabetes_prediction":
            if diabetes_model and diabetes_scaler and diabetes_class_encoder and diabetes_gender_encoder:
                # Define all expected features for the diabetes model, including categorical ones
                expected_features_diabetes = [
                    'AGE', 'GENDER', 'UREA', 'CR', 'HBA1C', 'CHOL', 'TG', 
                    'HDL', 'LDL', 'VLDL', 'BMI'
                ]

                # Prepare input_data, ensuring all expected features are present and correctly typed
                processed_input_diabetes = {}
                for feature in expected_features_diabetes:
                    value = input_data.get(feature)

                    if feature == 'GENDER':
                        processed_input_diabetes[feature] = diabetes_gender_encoder.transform([str(value) if value is not None else 'Male'])[0] 
                    else:
                        try:
                            processed_input_diabetes[feature] = float(value) if value is not None else 0.0
                        except (ValueError, TypeError):
                            processed_input_diabetes[feature] = 0.0

                df = pd.DataFrame([processed_input_diabetes], columns=expected_features_diabetes)
                
                # Apply scaler to the entire DataFrame if it was fitted on all features,
                # or only to the numerical features if that's how it was trained.
                # Based on heart_disease pattern, assuming it expects all features for transform.
                df_scaled = diabetes_scaler.transform(df) # Changed to pass full DataFrame

                prediction = diabetes_model.predict(df_scaled)[0] # Pass scaled data to model
                prediction_proba = diabetes_model.predict_proba(df_scaled).max() * 100 

                condition = diabetes_class_encoder.inverse_transform([prediction])[0] 
                
                recommendations = ["Consult an endocrinologist.", "Manage diet and exercise.", "Monitor blood glucose regularly."] if condition == "Positive" else ["Maintain healthy lifestyle.", "Regular check-ups."]
                urgency = "High" if condition == "Positive" else "Low"
                next_steps = ["Schedule a consultation with a diabetes specialist."] if condition == "Positive" else ["Continue healthy living and monitor risk factors."]

                prediction_result = {
                    "condition": f"Diabetes Prediction: {condition}",
                    "confidence": round(prediction_proba, 2),
                    "category": "Endocrinology",
                    "recommendations": recommendations,
                    "urgency": urgency,
                    "next_steps": next_steps
                }
            else:
                return jsonify({'error': 'Diabetes prediction model not loaded.'}), 503

        elif model_name == "kidney_stone_detection":
            if kidney_model and kidney_scaler:
                # Define all expected features for the kidney stone model
                expected_features_kidney = ['gravity', 'ph', 'osmo', 'cond', 'urea', 'calc']

                # Prepare input data ensuring all expected features are present and are floats
                processed_input_kidney = {}
                for feature in expected_features_kidney:
                    value = input_data.get(feature)
                    try:
                        processed_input_kidney[feature] = float(value) if value is not None else 0.0
                    except (ValueError, TypeError):
                        processed_input_kidney[feature] = 0.0
                
                df = pd.DataFrame([processed_input_kidney], columns=expected_features_kidney)
                
                # Apply scaler to the entire DataFrame. Assuming it was fitted on all features.
                df_scaled = kidney_scaler.transform(df) # Changed to pass full DataFrame

                prediction = kidney_model.predict(df_scaled)[0] # Pass scaled data to model
                prediction_proba = kidney_model.predict_proba(df_scaled).max() * 100

                condition = "Kidney Stones Detected" if prediction == 1 else "No Kidney Stones Detected"
                recommendations = ["Consult a urologist.", "Increase fluid intake and dietary changes.", "Monitor symptoms."] if prediction == 1 else ["Maintain healthy hydration.", "Regular check-ups."]
                urgency = "High" if prediction == 1 else "Low"
                next_steps = ["Schedule an appointment for further investigation and treatment options."] if prediction == 1 else ["Continue healthy habits."]

                prediction_result = {
                    "condition": condition,
                    "confidence": round(prediction_proba, 2),
                    "category": "Urology",
                    "recommendations": recommendations,
                    "urgency": urgency,
                    "next_steps": next_steps
                }
            else:
                return jsonify({'error': 'Kidney stone detection model not loaded.'}), 503
        
        else:
            return jsonify({'error': 'Invalid model_name provided.'}), 400

        if prediction_result:
            return jsonify(prediction_result), 200
        else:
            return jsonify({'error': 'ML prediction failed or returned no results.'}), 500

    except Exception as e:
        logger.error(f"ML diagnosis error for model {model_name}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error during ML diagnosis'}), 500

# ==================== PATIENT MANAGEMENT ROUTES ====================

@app.route('/api/patients', methods=['GET'])
def get_patients():
    """Get all patients (for doctor dashboard)."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("GET /api/patients: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401
        
        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        app.logger.info(f"GET /api/patients: User fetched by token: {user_session}")
        
        if not user_session or user_session.get('role') != 'doctor':
            app.logger.warning(f"GET /api/patients: Permission denied for user {user_session.get('id') if user_session else 'N/A'} with role {user_session.get('role') if user_session else 'N/A'}.")
            return jsonify({'error': 'Permission denied. Only doctors can view patients.'}), 403
            
        app.logger.info("Attempting to fetch patients from database.")
        patients = db.get_all_patients()
        # Robust decryption for email and phone_number fields
        for patient in patients:
            # Safe email decryption
            if 'email' in patient and patient['email']:
                try:
                    if '@' in patient['email']:
                        pass  # Already plaintext
                    else:
                        patient['email'] = decrypt_sensitive_data(patient['email'])
                except Exception as e:
                    app.logger.error(f"Decryption error for patient {patient.get('id')} email: {e}", exc_info=True)
                    patient['email'] = patient['email']  # fallback to original value
            # Safe phone_number decryption
            if 'phone_number' in patient and patient['phone_number']:
                try:
                    # If it looks like a phone number, just use it
                    if patient['phone_number'].replace('+', '').replace('-', '').isdigit():
                        pass  # Already plaintext
                    else:
                        patient['phone_number'] = decrypt_sensitive_data(patient['phone_number'])
                except Exception as e:
                    app.logger.error(f"Decryption error for patient {patient.get('id')} phone_number: {e}", exc_info=True)
                    patient['phone_number'] = patient['phone_number']  # fallback to original value
        app.logger.info(f"Successfully fetched {len(patients) if patients else 0} patients.")
        return jsonify(patients), 200
    except Exception as e:
        app.logger.error(f"Error getting patients: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch patients', 'details': str(e)}), 500

@app.route('/api/patients/<patient_id>', methods=['GET'])
def get_patient(patient_id):
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'success': False, 'error': 'Authentication required', 'redirect': '/auth/login'}), 401
        
        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        
        if not user_session or (user_session.get('role') != 'doctor' and user_session.get('id') != patient_id):
            return jsonify({'success': False, 'error': 'Permission denied. Only doctors or the patient themselves can view this profile.'}), 403
            
        patient = db.get_user_by_id(patient_id)
        if patient:
            return jsonify({'success': True, 'patient': patient}), 200
        else:
            return jsonify({'success': False, 'error': 'Patient not found'}), 404
    except Exception as e:
        logger.error(f"Error getting patient {patient_id}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to fetch patient data'}), 500

@app.route('/api/patients/<patient_id>/health-data', methods=['POST'])
def update_health_data():
    """Update health data for a specific patient."""
    try:
        # Authentication and authorization logic here
        return jsonify({'success': True, 'message': 'Health data updated successfully.'}), 200
    except Exception as e:
        logger.error(f"Error updating health data: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to update health data.'}), 500


@app.route('/api/patients/<patient_id>/prescriptions', methods=['GET', 'OPTIONS'])
def get_patient_prescriptions(patient_id):
    """Get all prescriptions for a specific patient."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("GET /api/patients/<patient_id>/prescriptions: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        app.logger.info(f"GET /api/patients/<patient_id>/prescriptions: User fetched by token: {user_session}")

        if not user_session or user_session.get('role') != 'doctor':
            app.logger.warning(f"GET /api/patients/<patient_id>/prescriptions: Unauthorized access attempt by user {user_session.get('id') if user_session else 'N/A'} with role {user_session.get('role') if user_session else 'N/A'}.")
            return jsonify({'error': 'Permission denied. Only doctors can view patient prescriptions.'}), 403

        # CORRECTED FUNCTION CALL
        prescriptions = db.get_prescriptions_by_patient(patient_id)
        return jsonify({
            'success': True,
            'prescriptions': prescriptions
        }), 200
    except Exception as e:
        app.logger.error(f"Error fetching patient prescriptions for patient {patient_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch patient prescriptions'}), 500

@app.route('/api/patients/<patient_id>/prescriptions', methods=['POST', 'OPTIONS'])
def create_prescription(patient_id):
    """Create a new prescription for a specific patient."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("POST /api/patients/<patient_id>/prescriptions: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        app.logger.info(f"POST /api/patients/<patient_id>/prescriptions: User fetched by token: {user_session}")

        if not user_session or user_session.get('role') != 'doctor':
            app.logger.warning(f"POST /api/patients/<patient_id>/prescriptions: Unauthorized access attempt by user {user_session.get('id') if user_session else 'N/A'} with role {user_session.get('role') if user_session else 'N/A'}.")
            return jsonify({'error': 'Permission denied. Only doctors can create prescriptions.'}), 403

        prescription_data = request.get_json()
        prescription_data['doctor_id'] = user_session['id']
        prescription_data['patient_id'] = patient_id

        # Only require the fields that exist in your DB
        if not all(k in prescription_data for k in ['medication_name', 'dosage', 'doctor_id', 'patient_id']):
            app.logger.warning("Missing required fields for prescription creation.")
            return jsonify({'error': 'Missing required prescription fields'}), 400

        new_prescription = db.create_prescription(prescription_data)

        if new_prescription:
            app.logger.info(f"Prescription created for patient {patient_id} by doctor {user_session['id']}.")
            return jsonify({'success': True, 'prescription': new_prescription}), 201
        else:
            app.logger.error(f"Failed to create prescription for patient {patient_id}.")
            return jsonify({'success': False, 'error': 'Failed to create prescription.'}), 500

    except Exception as e:
        app.logger.error(f"Error creating prescription for patient {patient_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to create prescription.'}), 500

# ==================== MEDICAL RECORDS ROUTES ====================

@app.route('/api/medical-records', methods=['POST'])
def upload_medical_record():
    """Upload a new medical record (e.g., PDF, image)."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)

        if not user_session:
            return jsonify({'error': 'Invalid authentication token.'}), 401

        # Determine if the uploader is a doctor or patient
        uploader_id = user_session['id']
        uploader_role = user_session['role']

        if 'file' not in request.files:
            return jsonify({'error': 'No file part in the request'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        record_type = request.form.get('record_type', 'unspecified')
        title = request.form.get('title', 'Medical Record')
        description = request.form.get('description', '')
        patient_id = request.form.get('patient_id') # Required if doctor is uploading for a patient

        if uploader_role == 'doctor' and not patient_id:
            return jsonify({'error': 'Patient ID is required for doctors uploading records.'}), 400
        elif uploader_role == 'patient':
            patient_id = uploader_id # Patient uploads their own record

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_extension = filename.rsplit('.', 1)[1].lower()

            # Save file to a temporary location
            temp_dir = tempfile.mkdtemp()
            temp_filepath = os.path.join(temp_dir, filename)
            file.save(temp_filepath)

            # Upload to IPFS
            ipfs_hash = ipfs_service.upload_file(file_content=open(temp_filepath, 'rb').read(), filename=filename)

            # Clean up temporary file
            os.remove(temp_filepath)
            os.rmdir(temp_dir)

            if not ipfs_hash:
                return jsonify({'error': 'Failed to upload file to IPFS'}), 500

            # Construct the IPFS gateway URL
            pinata_gateway_url = app.config.get('PINATA_GATEWAY_URL') # Retrieve from config again for clarity
            if not pinata_gateway_url:
                app.logger.error("PINATA_GATEWAY_URL not configured in app.config.")
                return jsonify({'error': 'Pinata Gateway URL not configured.'}), 500

            profile_pic_url = f"{pinata_gateway_url}/ipfs/{ipfs_hash}"

            # Prepare medical record data
            medical_record_data = {
                'patient_id': patient_id,
                'uploaded_by_id': uploader_id,
                'record_type': record_type,
                'title': title,
                'description': description,
                'file_url': profile_pic_url,
                'ipfs_hash': ipfs_hash,
                'uploaded_at': datetime.utcnow().isoformat() + '+00:00'
            }

            # Save record metadata to Supabase
            new_record = db.create_medical_record(medical_record_data)

            if new_record:
                return jsonify({'success': True, 'message': 'Medical record uploaded and saved.', 'record': new_record}), 201
            else:
                return jsonify({'error': 'Failed to save medical record metadata.'}), 500
        else:
            return jsonify({'error': 'Invalid file type or no file selected.'}), 400
    except Exception as e:
        logger.error(f"Error uploading medical record: {e}", exc_info=True)
        return jsonify({'error': 'Failed to upload medical record.'}), 500

@app.route('/api/medical-records/single/<record_id>', methods=['GET', 'OPTIONS'])
def get_single_medical_record(record_id):
    """Get a single medical record by its ID."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("GET /api/medical-records/single/<record_id>: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401
        
        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)

        if not user_session:
            app.logger.warning("GET /api/medical-records/single/<record_id>: Invalid authentication token.")
            return jsonify({'error': 'Invalid authentication token.'}), 401

        record = db.get_medical_record_by_id(record_id)

        if not record:
            app.logger.warning(f"Medical record with ID {record_id} not found.")
            return jsonify({'error': 'Medical record not found.'}), 404

        # Authorization check: Only the patient themselves or their doctor can view the record
        if user_session.get('id') != record.get('patient_id') and user_session.get('role') != 'doctor':
            app.logger.warning(f"Unauthorized access attempt to medical record {record_id} by user {user_session.get('id')} with role {user_session.get('role')}.")
            return jsonify({'error': 'Permission denied to view this medical record.'}), 403

        return jsonify({'success': True, 'medical_record': record}), 200

    except Exception as e:
        app.logger.error(f"Error fetching single medical record {record_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch medical record.'}), 500

@app.route('/api/patients/<patient_id>/medical-records', methods=['POST'])
def create_patient_medical_record(patient_id):
    """Create a new medical record for a specific patient (for doctor dashboard)."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("POST /api/patients/<patient_id>/medical-records: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        app.logger.info(f"POST /api/patients/<patient_id>/medical-records: User fetched by token: {user_session}")

        if not user_session or user_session.get('role') != 'doctor':
            app.logger.warning(f"POST /api/patients/<patient_id>/medical-records: Unauthorized access attempt by user {user_session.get('id') if user_session else 'N/A'} with role {user_session.get('role') if user_session else 'N/A'}.")
            return jsonify({'error': 'Permission denied. Only doctors can create medical records for patients.'}), 403

        doctor_user = user_session # Already fetched from token, no need to get by ID again

        record_data = request.get_json()
        record_data['patient_id'] = patient_id
        record_data['uploaded_by_id'] = doctor_user['id'] # Doctor's ID

        # Validate medical record data
        if not validate_medical_record(record_data):
            app.logger.warning("Invalid medical record data provided.")
            return jsonify({'error': 'Invalid medical record data.'}), 400

        new_record = db.create_medical_record(record_data)

        if new_record:
            app.logger.info(f"Medical record created for patient {patient_id} by doctor {doctor_user['id']}.")
            return jsonify({'success': True, 'medical_record': new_record}), 201
        else:
            app.logger.error(f"Failed to create medical record for patient {patient_id}.")
            return jsonify({'success': False, 'error': 'Failed to add medical record.'}), 500

    except Exception as e:
        app.logger.error(f"Error creating medical record for patient {patient_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to add medical record.'}), 500

@app.route('/api/medical-records/<patient_id>/vitals', methods=['POST', 'OPTIONS'])
def add_patient_vitals(patient_id):
    """Add new vital signs as a medical record for a specific patient."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("POST /api/medical-records/<patient_id>/vitals: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        app.logger.info(f"POST /api/medical-records/<patient_id>/vitals: User fetched by token: {user_session}")

        if not user_session or user_session.get('role') != 'doctor':
            app.logger.warning(f"POST /api/medical-records/<patient_id>/vitals: Unauthorized access attempt by user {user_session.get('id') if user_session else 'N/A'} with role {user_session.get('role') if user_session else 'N/A'}.")
            return jsonify({'error': 'Permission denied. Only doctors can add vitals.'}), 403

        doctor_id = user_session['id']
        vitals_data = request.get_json()

        # Construct a medical record entry for vitals
        record_date = vitals_data.get('record_date')
        if not record_date:
            record_date = datetime.utcnow().isoformat() + '+00:00'

        title = f"Vitals Record - {datetime.fromisoformat(record_date.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M')}"
        description = (
            f"Heart Rate: {vitals_data.get('heart_rate', 'N/A')} bpm, "
            f"Blood Pressure: {vitals_data.get('blood_pressure_systolic', 'N/A')}/{vitals_data.get('blood_pressure_diastolic', 'N/A')} mmHg, "
            f"Temperature: {vitals_data.get('temperature', 'N/A')}°C, "
            f"Oxygen Saturation: {vitals_data.get('oxygen_saturation', 'N/A')}%, "
            f"Respiratory Rate: {vitals_data.get('respiratory_rate', 'N/A')} breaths/min"
        )
        
        medical_record_data = {
            'patient_id': patient_id,
            'uploaded_by_id': doctor_id,
            'record_type': 'Vitals',
            'title': title,
            'description': description,
            'record_date': record_date, # Use the provided or generated record_date
            # You might store specific vital signs in a JSONB column or separate columns if your schema supports it
            'vitals_data': vitals_data # Store raw vitals data in a JSONB column
        }

        # Validate medical record data (optional, can use a more specific vital validation)
        # if not validate_medical_record(medical_record_data):
        #     return jsonify({'error': 'Invalid vital signs data.'}), 400

        new_record = db.create_medical_record(medical_record_data)

        if new_record:
            app.logger.info(f"Vital signs added for patient {patient_id} by doctor {doctor_id}.")
            return jsonify({'success': True, 'message': 'Vital signs added as medical record.', 'record': new_record}), 201
        else:
            app.logger.error(f"Failed to add vital signs for patient {patient_id}.")
            return jsonify({'success': False, 'error': 'Failed to add vital signs.'}), 500

    except Exception as e:
        app.logger.error(f"Error adding vital signs for patient {patient_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to add vital signs.'}), 500


@app.route('/api/medical-records/<patient_id>', methods=['GET'])
def get_medical_records(patient_id):
    """Get all medical records for a specific patient."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("GET /api/medical-records/<patient_id>: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        app.logger.info(f"GET /api/medical-records/<patient_id>: User fetched by token: {user_session}")

        if not user_session:
            app.logger.warning("Invalid authentication token.")
            return jsonify({'error': 'Invalid authentication token.'}), 401

        # Determine if the requester is the patient themselves or their doctor
        requester_id = user_session['id']
        requester_role = user_session['role']

        if requester_role == 'patient' and requester_id != patient_id:
            app.logger.warning(f"Patient {requester_id} attempted to access medical records of patient {patient_id}.")
            return jsonify({'error': 'Permission denied. You can only view your own medical records.'}), 403
        elif requester_role == 'doctor':
            # Doctors can view any patient's records, but we might want to restrict to their own patients in a real app
            pass
        else:
            app.logger.warning(f"Unauthorized role {requester_role} attempting to access medical records.")
            return jsonify({'error': 'Permission denied. Unauthorized role.'}), 403

        medical_records = db.get_medical_records(patient_id)
        
        # Ensure 'uploaded_at' is consistently formatted for the frontend
        for record in medical_records:
            if 'uploaded_at' in record and record['uploaded_at']:
                try:
                    # Parse as UTC, then format to a common string (e.g., ISO format)
                    record['uploaded_at'] = datetime.fromisoformat(record['uploaded_at'].replace('Z', '+00:00')).isoformat()
                except ValueError:
                    app.logger.warning(f"Invalid uploaded_at format for record {record.get('id')}: {record['uploaded_at']}")
                    # Keep original or set to None if parsing fails

        return jsonify({'success': True, 'medical_records': medical_records}), 200

    except Exception as e:
        app.logger.error(f"Error fetching medical records for patient {patient_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch medical records.'}), 500

@app.route('/api/medical-records/download/<record_id>', methods=['GET'])
def download_medical_record(record_id):
    """Download a specific medical record file by its ID."""
    try:
        # Authentication and authorization logic here
        # Verify user has access to this record
        record = db.get_medical_record_by_id(record_id)
        if not record:
            return jsonify({'error': 'Record not found'}), 404

        # In a real application, you'd fetch the file from IPFS using ipfs_url or ipfs_hash
        # For this example, we'll assume the file is locally available or mock the download.
        # This is a placeholder for actual file download logic.
        
        # For demonstration, let's assume we have a dummy file to send
        # In production, you'd fetch from IPFS via `ipfs_service.download_file(record['ipfs_hash'])`
        dummy_file_path = "path/to/your/dummy_medical_record.pdf" 
        if os.path.exists(dummy_file_path):
            return send_file(dummy_file_path, as_attachment=True, download_name=f"{record_id}.pdf"), 200
        else:
            return jsonify({'error': 'File not found on server (or IPFS).'}), 500

    except Exception as e:
        logger.error(f"Error downloading medical record {record_id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to download medical record.'}), 500

@app.route('/api/medical-records/<record_id>', methods=['DELETE', 'OPTIONS'])
def delete_medical_record_route(record_id):
    """Delete a medical record by ID."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("DELETE /api/medical-records/<record_id>: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)

        if not user_session or user_session.get('role') != 'doctor':
            app.logger.warning(f"Unauthorized delete attempt by user {user_session.get('id') if user_session else 'N/A'} with role {user_session.get('role') if user_session else 'N/A'}.")
            return jsonify({'error': 'Permission denied. Only doctors can delete medical records.'}), 403

        # Verify the record exists and belongs to a patient of this doctor if applicable
        record_to_delete = db.get_medical_record_by_id(record_id)
        if not record_to_delete:
            return jsonify({'error': 'Medical record not found.'}), 404
        
        # In a real application, you might add a check here to ensure the doctor
        # is authorized to delete this specific patient's record (e.g., they are assigned).

        success = db.delete_medical_record(record_id)

        if success:
            app.logger.info(f"Medical record {record_id} deleted successfully by doctor {user_session['id']}.")
            return jsonify({'success': True, 'message': 'Medical record deleted successfully.'}), 200
        else:
            app.logger.error(f"Failed to delete medical record {record_id}.")
            return jsonify({'error': 'Failed to delete medical record.'}), 500

    except Exception as e:
        app.logger.error(f"Error deleting medical record {record_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to delete medical record.'}), 500

@app.route('/api/medical-records/<record_id>', methods=['PUT', 'OPTIONS'])
def update_medical_record_route(record_id):
    """Update an existing medical record by ID."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("PUT /api/medical-records/<record_id>: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)

        if not user_session or user_session.get('role') != 'doctor':
            app.logger.warning(f"Unauthorized update attempt by user {user_session.get('id') if user_session else 'N/A'} with role {user_session.get('role') if user_session else 'N/A'}.")
            return jsonify({'error': 'Permission denied. Only doctors can update medical records.'}), 403

        record_to_update = db.get_medical_record_by_id(record_id)
        if not record_to_update:
            return jsonify({'error': 'Medical record not found.'}), 404

        update_data = request.get_json()
        
        # Remove 'updated_at' from update_data if present, as Supabase trigger handles it
        if 'updated_at' in update_data:
            del update_data['updated_at']

        # Ensure that only allowed fields are updated
        allowed_update_fields = ['record_type', 'title', 'description', 'file_url', 'ipfs_hash', 'record_date', 'vitals_data']
        filtered_update_data = {k: v for k, v in update_data.items() if k in allowed_update_fields}

        if not filtered_update_data:
            return jsonify({'message': 'No valid fields provided for update'}), 400

        updated_record = db.update_medical_record(record_id, filtered_update_data)

        if updated_record:
            app.logger.info(f"Medical record {record_id} updated successfully by doctor {user_session['id']}.")
            return jsonify({'success': True, 'message': 'Medical record updated successfully.', 'record': updated_record}), 200
        else:
            app.logger.error(f"Failed to update medical record {record_id}.")
            return jsonify({'error': 'Failed to update medical record.'}), 500

    except Exception as e:
        app.logger.error(f"Error updating medical record {record_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update medical record.'}), 500

# ==================== EMERGENCY ROUTES ====================

@app.route('/api/emergency/alert', methods=['POST'])
def create_emergency_alert():
    """Create an emergency alert."""
    try:
        # Authentication and authorization logic here
        data = request.get_json()
        location = data.get('location')
        patient_id = data.get('patient_id') # Patient who triggered the alert
        
        if not location or not patient_id:
            return jsonify({'error': 'Location and patient ID required.'}), 400

        alert_details = emergency_service.create_alert(patient_id, location)
        
        if alert_details:
            return jsonify({'success': True, 'message': 'Emergency alert created successfully', 'alert': alert_details}), 201
        else:
            return jsonify({'error': 'Failed to create emergency alert.'}), 500
    except Exception as e:
        logger.error(f"Error creating emergency alert: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to create emergency alert.'}), 500

@app.route('/api/emergency/ambulance', methods=['POST'])
def request_ambulance():
    """Request an ambulance to a specific location."""
    try:
        # Authentication and authorization logic here
        data = request.get_json()
        patient_id = data.get('patient_id')
        location = data.get('location')
        emergency_type = data.get('emergency_type', 'medical') # e.g., 'medical', 'accident'
        
        if not patient_id or not location:
            return jsonify({'error': 'Patient ID and location required.'}), 400

        response = emergency_service.dispatch_ambulance(patient_id, location, emergency_type)
        
        if response:
            return jsonify({'success': True, 'message': 'Ambulance dispatched successfully', 'details': response}), 200
        else:
            return jsonify({'error': 'Failed to dispatch ambulance.'}), 500
    except Exception as e:
        logger.error(f"Error requesting ambulance: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to request ambulance.'}), 500

# ==================== ANALYTICS ROUTES ====================

@app.route('/api/analytics/dashboard', methods=['GET'])
def get_dashboard_analytics():
    """Get overall dashboard analytics."""
    try:
        # Authentication and authorization logic for doctors/admins
        analytics_data = analytics_service.get_overall_dashboard_data()
        return jsonify({'success': True, 'data': analytics_data}), 200
    except Exception as e:
        logger.error(f"Error getting dashboard analytics: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch dashboard analytics.'}), 500

@app.route('/api/analytics/consultations', methods=['GET'])
def get_consultation_analytics():
    """Get analytics related to consultations."""
    try:
        # Authentication and authorization logic for doctors/admins
        analytics_data = analytics_service.get_consultation_metrics()
        return jsonify({'success': True, 'data': analytics_data}), 200
    except Exception as e:
        logger.error(f"Error getting consultation analytics: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch consultation analytics.'}), 500

@app.route('/api/analytics/patient-health-trends', methods=['GET'])
def get_patient_health_trends():
    """Get health trends for patients."""
    try:
        patient_id = request.args.get('patient_id')
        if not patient_id:
            return jsonify({'error': 'Patient ID required for health trends.'}), 400
        # Authentication and authorization logic here (patient can see their own, doctor can see their patients')
        health_trends_data = analytics_service.get_patient_health_trends(patient_id)
        return jsonify({'success': True, 'data': health_trends_data}), 200
    except Exception as e:
        logger.error(f"Error getting patient health trends: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch patient health trends.'}), 500

# ==================== CONSULTATION (APPOINTMENT) ROUTES ====================

@app.route('/api/consultations', methods=['POST', 'OPTIONS'])
def create_consultation():
    """Create a new consultation"""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("POST /api/consultations: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401
        
        token = auth_header.split(" ")[1]
        user = db.get_user_by_token(token)
        app.logger.info(f"POST /api/consultations: User fetched by token: {user}")

        if not user or user.get('role') != 'doctor':
            app.logger.warning(f"POST /api/consultations: Unauthorized access attempt by user {user.get('id') if user else 'N/A'} with role {user.get('role') if user else 'N/A'}.")
            return jsonify({'error': 'Permission denied. Only doctors can create consultations.'}), 403

        data = request.get_json()
        required_fields = ['patient_id', 'scheduled_at', 'reason', 'status']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required consultation fields'}), 400

        # Ensure doctor_id is the authenticated doctor's ID
        data['doctor_id'] = user['id']

        # Convert scheduled_at to UTC and ISO format
        scheduled_at_str = data['scheduled_at']
        try:
            # Assuming scheduled_at is coming in a format like "YYYY-MM-DDTHH:MM:SS" or similar
            # If it comes as a local time string, it's better to explicitly parse it with a timezone
            # For simplicity here, assuming it's already UTC or can be treated as such for DB storage
            scheduled_at_dt = datetime.fromisoformat(scheduled_at_str)
            if scheduled_at_dt.tzinfo is None: # If no timezone info, assume UTC
                scheduled_at_dt = scheduled_at_dt.replace(tzinfo=timezone.utc)
            data['scheduled_at'] = scheduled_at_dt.isoformat()
        except ValueError:
            return jsonify({'error': 'Invalid scheduled_at format. Expected ISO format.'}), 400

        new_consultation = db.create_consultation(data)

        if new_consultation:
            app.logger.info(f"Consultation created for patient {data['patient_id']} by doctor {data['doctor_id']}.")
            return jsonify({'success': True, 'consultation': new_consultation}), 201
        else:
            app.logger.error(f"Failed to create consultation.")
            return jsonify({'success': False, 'error': 'Failed to create consultation.'}), 500

    except Exception as e:
        app.logger.error(f"Error creating consultation: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to create consultation.'}), 500

@app.route('/api/consultations/<consultation_id>', methods=['PUT', 'OPTIONS'])
def update_consultation(consultation_id):
    """Update an existing consultation."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)

        if not user_session or user_session.get('role') != 'doctor':
            return jsonify({'error': 'Permission denied. Only doctors can update consultations.'}), 403

        update_data = request.get_json()

        updated_consultation = db.update_consultation(consultation_id, update_data)

        if updated_consultation:
            return jsonify({'success': True, 'message': 'Consultation updated successfully', 'consultation': updated_consultation}), 200
        else:
            return jsonify({'error': 'Failed to update consultation.'}), 500

    except Exception as e:
        logger.error(f"Error updating consultation {consultation_id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to update consultation.'}), 500


# ==================== HEALTH MONITORING ROUTES ====================

@app.route('/api/health-monitoring/alerts', methods=['GET'])
def get_health_alerts():
    """Get real-time health alerts."""
    try:
        # Authentication and authorization logic
        alerts = db.get_health_alerts() # Assuming this function exists
        return jsonify({'success': True, 'alerts': alerts}), 200
    except Exception as e:
        logger.error(f"Error getting health alerts: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to fetch health alerts.'}), 500

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found', 'message': str(error)}), 404

@app.errorhandler(500)
def internal_error(error):
    app.logger.exception("Internal server error: %s", error)
    return jsonify({'error': 'Internal server error', 'message': str(error)}), 500

# ==================== GEMINI INTEGRATION ROUTES ====================

@app.route('/api/gemini/voice', methods=['POST'])
def gemini_voice_assistant():
    """Integrate with Gemini voice assistant (placeholder)."""
    try:
        data = request.get_json()
        user_query = data.get('query')
        if not user_query:
            return jsonify({'error': 'Query parameter is missing.'}), 400
        
        # Placeholder for Gemini integration logic
        response = f"Gemini assistant: You asked: {user_query}. (This is a placeholder response)"
        return jsonify({'success': True, 'response': response}), 200
    except Exception as e:
        logger.error(f"Gemini voice assistant error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to process voice command.'}), 500

@app.route('/api/gemini/voice-audio', methods=['POST'])
def gemini_voice_audio():
    """Process audio input for Gemini voice assistant (placeholder)."""
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        # Save audio temporarily, process with speech-to-text, then pass to Gemini
        # Placeholder for audio processing and Gemini integration
        
        recognizer = sr.Recognizer()
        with sr.AudioFile(audio_file) as source:
            audio_data = recognizer.record(source)
            text = recognizer.recognize_google(audio_data) # Using Google Web Speech API for example
        
        response = f"Gemini assistant processed your audio: '{text}'. (Placeholder response)"
        return jsonify({'success': True, 'response': response}), 200
    except Exception as e:
        logger.error(f"Gemini voice audio processing error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to process audio for Gemini.'}), 500


# ==================== USER PROFILE ROUTES ====================

@app.route('/api/users/<user_id>', methods=['GET', 'PUT', 'OPTIONS'])
def get_user_by_id(user_id):
    """Get or update a user's profile by ID. Doctors and patients can access their own, doctors can update patients."""
    if request.method == 'OPTIONS':
        return '', 200
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        app.logger.warning("GET/PUT /api/users/<user_id>: Authentication required.")
        return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

    token = auth_header.split(" ")[1]
    current_session = db.get_user_by_token(token)
    
    if not current_session:
        app.logger.warning(f"Invalid token for user ID {user_id}. Token: {token}")
        return jsonify({'error': 'Unauthorized: Invalid token'}), 401

    try:
        user = db.get_user_by_id(user_id)
        if not user:
            app.logger.warning(f"User {user_id} not found in DB.")
            return jsonify({'error': 'User not found'}), 404

        # Authorization check: A user can access their own profile.
        # A doctor can access/update any patient's profile.
        # Patients cannot access other users' profiles (including other patients or doctors).
        if current_session.get('id') != user_id and current_session.get('role') != 'doctor':
            app.logger.warning(f"Unauthorized access attempt by user {current_session.get('id')} (role: {current_session.get('role')}) to profile of user {user_id}.")
            return jsonify({'error': 'Permission denied'}), 403

        if request.method == 'GET':
            # Robust decryption and fallback for email
            if 'email' in user and user['email']:
                try:
                    if '@' in user['email']:
                        pass  # Already plaintext
                    else:
                        user['email'] = decrypt_sensitive_data(user['email'])
                except Exception as e:
                    app.logger.error(f"Decryption error for user {user_id} email: {e}", exc_info=True)
                    user['email'] = f"unknown_{user_id[:8]}@healthai.com"
            else:
                user['email'] = f"unknown_{user_id[:8]}@healthai.com"
            # Robust decryption and fallback for phone_number
            if 'phone_number' in user and user['phone_number']:
                try:
                    if user['phone_number'].replace('+', '').replace('-', '').isdigit():
                        pass  # Already plaintext
                    else:
                        user['phone_number'] = decrypt_sensitive_data(user['phone_number'])
                except Exception as e:
                    app.logger.error(f"Decryption error for user {user_id} phone_number: {e}", exc_info=True)
                    user['phone_number'] = "Unknown"
            else:
                user['phone_number'] = "Unknown"
            # Fallback for missing or empty name
            if not user.get('name'):
                user['name'] = "Unknown User"
            app.logger.info(f"GET /api/users/<user_id>: User fetched for display: {user.get('id')}")
            return jsonify({'user': user}), 200

        elif request.method == 'PUT':
            data = request.get_json()
            updated_data = {}
            
            # Allow only certain fields to be updated by doctors for patients, or by self
            allowed_fields_for_update = [
                'name', 'email', 'phone_number', 'profile_pic_url', 'wallet_address',
                'specialization', 'license_number', 'hospital', 'is_verified'
            ]

            # Doctors can update all allowed fields for patients
            if current_session.get('role') == 'doctor' and user['role'] == 'patient':
                for field in allowed_fields_for_update:
                    if field in data:
                        if field == 'email':
                            updated_data[field] = encrypt_sensitive_data(data[field])
                        else:
                            updated_data[field] = data[field]
            # Users can update their own profile fields (excluding role, etc. unless admin)
            elif current_session.get('id') == user_id:
                for field in allowed_fields_for_update:
                    # Prevent users from changing their own role or verification status
                    if field in data and field not in ['role', 'is_verified']:
                        if field == 'email':
                            updated_data[field] = encrypt_sensitive_data(data[field])
                        else:
                            updated_data[field] = data[field]
            else:
                app.logger.warning(f"Unauthorized PUT attempt by user {current_session.get('id')} (role: {current_session.get('role')}) to profile of user {user_id}.")
                return jsonify({'error': 'Permission denied to update these fields'}), 403

            if not updated_data:
                return jsonify({'message': 'No valid fields provided for update'}), 400

            updated_user = db.update_user(user_id, updated_data)

            if updated_user:
                app.logger.info(f"User {user_id} updated successfully.")
                # Decrypt sensitive data before sending back in response
                if 'email' in updated_user and updated_user['email']:
                    try:
                        updated_user['email'] = decrypt_sensitive_data(updated_user['email'])
                    except Exception as e:
                        app.logger.error(f"Decryption error after update for user {user_id} email: {e}", exc_info=True)
                        updated_user['email'] = "DECRYPTION_FAILED"
                if 'phone_number' in updated_user and updated_user['phone_number']:
                    try:
                        updated_user['phone_number'] = decrypt_sensitive_data(updated_user['phone_number'])
                    except Exception as e:
                        app.logger.error(f"Decryption error after update for user {user_id} phone_number: {e}", exc_info=True)
                        updated_user['phone_number'] = "DECRYPTION_FAILED"

                return jsonify({'success': True, 'user': updated_user}), 200
            else:
                app.logger.error(f"Failed to update user {user_id}.")
                return jsonify({'error': 'Failed to update user'}), 500

    except Exception as e:
        app.logger.error(f"Error getting/updating user {user_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch/update user data'}), 500

@app.route('/api/users/<user_id>/profile-picture', methods=['POST'])
def upload_profile_picture(user_id):
    """Upload a profile picture for a user."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("POST /api/users/<user_id>/profile-picture: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)

        if not user_session or user_session['id'] != user_id:
            app.logger.warning(f"Unauthorized profile picture upload attempt by user {user_session.get('id') if user_session else 'N/A'} for user {user_id}.")
            return jsonify({'error': 'Permission denied. You can only upload your own profile picture.'}), 403

        if 'profile_picture' not in request.files:
            return jsonify({'error': 'No profile picture file provided'}), 400

        file = request.files['profile_picture']
        if file.filename == '':
            return jsonify({'error': 'No selected file for profile picture'}), 400

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            
            # Read file content as bytes
            file_content = file.read()

            # Upload to IPFS using the initialized ipfs_service
            # Ensure ipfs_service has the gateway_url set during its __init__
            ipfs_hash = ipfs_service.upload_file(file_content=file_content, filename=filename)

            if not ipfs_hash:
                return jsonify({'error': 'Failed to upload profile picture to IPFS'}), 500

            # Construct the IPFS gateway URL
            pinata_gateway_url = app.config.get('PINATA_GATEWAY_URL') # Retrieve from config again for clarity
            if not pinata_gateway_url:
                app.logger.error("PINATA_GATEWAY_URL not configured in app.config.")
                return jsonify({'error': 'Pinata Gateway URL not configured.'}), 500

            profile_pic_url = f"{pinata_gateway_url}/ipfs/{ipfs_hash}"

            # Update user's profile_pic_url in Supabase
            updated_user = db.update_user(user_id, {'profile_pic_url': profile_pic_url})

            if updated_user:
                app.logger.info(f"Profile picture uploaded and updated for user {user_id}.")
                return jsonify({'success': True, 'message': 'Profile picture updated successfully', 'profile_pic_url': profile_pic_url}), 200
            else:
                app.logger.error(f"Failed to update profile picture URL for user {user_id}.")
                return jsonify({'error': 'Failed to update profile picture.'}), 500
        else:
            return jsonify({'error': 'Invalid file type for profile picture.'}), 400
    except Exception as e:
        app.logger.error(f"Error uploading profile picture for user {user_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to upload profile picture.'}), 500

# ==================== DOCTOR DASHBOARD ROUTES ====================

@app.route('/api/doctor/appointments', methods=['GET', 'OPTIONS'])
def get_doctor_appointments():
    """Get appointments for a specific doctor."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            app.logger.warning("GET /api/doctor/appointments: Authentication required.")
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        app.logger.info(f"GET /api/doctor/appointments: User fetched by token: {user_session}")

        if not user_session or user_session.get('role') != 'doctor':
            app.logger.warning(f"GET /api/doctor/appointments: Unauthorized access attempt by user {user_session.get('id') if user_session else 'N/A'} with role {user_session.get('role') if user_session else 'N/A'}.")
            return jsonify({'error': 'Permission denied. Only doctors can view their appointments.'}), 403

        doctor_id = user_session['id']
        time_range = request.args.get('time_range', 'today') # 'today', 'upcoming', 'past'

        appointments = []
        # Corrected: Need to handle the complex query in supabase_client.py if embedding users from two foreign keys
        # For now, simplifying to just fetch consultations, frontend will resolve patient names.
        if time_range == 'today':
            today_start = datetime.now(pytz.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            today_end = datetime.now(pytz.utc).replace(hour=23, minute=59, second=59, microsecond=999999)
            appointments = db.get_doctor_appointments(doctor_id, today_start.isoformat(), today_end.isoformat())
        elif time_range == 'upcoming':
            now = datetime.now(pytz.utc)
            appointments = db.get_doctor_appointments(doctor_id, now.isoformat(), None) # None for end_date means no upper limit
        elif time_range == 'past':
            now = datetime.now(pytz.utc)
            appointments = db.get_doctor_appointments(doctor_id, None, now.isoformat()) # None for start_date means no lower limit
        else:
            appointments = db.get_doctor_appointments(doctor_id) # Get all if invalid range

        return jsonify({'success': True, 'appointments': appointments}), 200

    except Exception as e:
        app.logger.error(f"Error getting doctor appointments for doctor {doctor_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch doctor appointments'}), 500

@app.route('/api/doctor/messages', methods=['GET', 'POST', 'OPTIONS'])
def handle_doctor_messages():
    """Handle messages for doctors (placeholder)."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)

        if not user_session or user_session.get('role') != 'doctor':
            return jsonify({'error': 'Permission denied. Only doctors can access messages.'}), 403

        doctor_id = user_session['id']

        if request.method == 'GET':
            # Placeholder for fetching doctor's messages
            messages = [{"id": "1", "sender": "Patient X", "subject": "Appointment Reminder", "message": "Confirming my appointment tomorrow.", "timestamp": datetime.utcnow().isoformat()}]
            return jsonify({'success': True, 'messages': messages}), 200
        elif request.method == 'POST':
            data = request.get_json()
            # Placeholder for sending a message
            return jsonify({'success': True, 'message': 'Message sent successfully (placeholder).'}), 200
    except Exception as e:
        app.logger.error(f"Error handling doctor messages: {e}", exc_info=True)
        return jsonify({'error': 'Failed to handle messages.'}), 500

@app.route('/api/doctor/urgent-cases', methods=['GET', 'OPTIONS'])
def get_doctor_urgent_cases():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        if not user_session or user_session.get('role') != 'doctor':
            return jsonify({'error': 'Permission denied. Only doctors can view urgent cases.'}), 403

        doctor_id = user_session['id']
        urgent_cases = db.get_urgent_cases_for_doctor(doctor_id)
        return jsonify({'success': True, 'urgent_cases': urgent_cases}), 200
    except Exception as e:
        app.logger.error(f"Error fetching urgent cases for doctor: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch urgent cases'}), 500

@app.route('/api/doctor/ai-insights', methods=['GET', 'OPTIONS'])
def get_doctor_ai_insights():
    if request.method == 'OPTIONS':
        return '', 200
    # TODO: Replace with real logic
    return jsonify({'insights': []}), 200
@app.route('/api/doctor/performance-metrics', methods=['GET', 'OPTIONS'])
def get_doctor_performance_metrics():
    if request.method == 'OPTIONS':
        return '', 200
    # TODO: Replace with real logic
    return jsonify({'metrics': []}), 200

@app.route('/api/patients', methods=['POST'])
def add_patient():
    """Add a new patient (doctor only)."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication required', 'redirect': '/auth/login'}), 401

        token = auth_header.split(" ")[1]
        user_session = db.get_user_by_token(token)
        if not user_session or user_session.get('role') != 'doctor':
            return jsonify({'error': 'Permission denied. Only doctors can add patients.'}), 403

        data = request.get_json()
        required_fields = ['name', 'email', 'wallet_address', 'gender']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields.'}), 400

        # Check if patient already exists
        existing_user = db.get_user_by_wallet(data['wallet_address'])
        if existing_user:
            return jsonify({'error': 'Patient already exists!'}), 409

        encrypted_email = encrypt_sensitive_data(data['email'])
        patient_data = {
            'wallet_address': data['wallet_address'],
            'name': data['name'],
            'email': encrypted_email,
            'role': 'patient',
            'gender': data['gender'],
            'created_at': datetime.utcnow().isoformat(),
            'is_verified': True
        }
        new_patient = db.create_user(patient_data)
        if new_patient:
            return jsonify({'success': True, 'patient': new_patient}), 201
        else:
            return jsonify({'error': 'Failed to add patient.'}), 500

    except Exception as e:
        logger.error(f"Error adding patient: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to add patient.'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)