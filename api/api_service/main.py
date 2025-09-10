import os
import sys
import json
from fastapi import FastAPI, HTTPException, Depends, Form, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Union, Annotated

# Add parent directory to path if needed for direct script execution
if __name__ == "__main__":
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import from project modules
from nlp_data_anonymizer import NLPDataAnonymizer, AnonymizerPersistence
from llm_integration import LLMIntegration
from prompt_generator import PromptGenerator

# Import local modules
try:
    # When running as a module
    from api_service.config import settings
    from api_service.utils import load_json_config, save_anonymizer_state, load_anonymizer_state, format_sensitivity_report, get_placeholder_mapping
except ImportError:
    # When running with relative imports
    from .config import settings
    from .utils import load_json_config, save_anonymizer_state, load_anonymizer_state, format_sensitivity_report, get_placeholder_mapping

app = FastAPI(
    title="NLP Data Anonymizer API",
    description="API for anonymizing sensitive data in text and generating LLM responses",
    version="1.0.0",
)

# CORS middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load configuration
config = load_json_config()

# Initialize service components
def get_anonymizer():
    """Initialize and return the anonymizer instance."""
    anonymizer_config = config.get("anonymizer", {})
    model_name = anonymizer_config.get("model_name", settings.SPACY_MODEL)
    
    anonymizer = NLPDataAnonymizer(model_name=model_name)
    
    # Add domain-specific terms if available
    domain_terms = config.get("domain_specific_terms", {})
    for category, terms in domain_terms.items():
        anonymizer.add_domain_specific_terms(category, terms)
    
    # Load existing mappings if available
    load_anonymizer_state(anonymizer)
        
    return anonymizer

def get_llm():
    """Initialize and return the LLM integration instance."""
    llm_config = config.get("llm", {})
    provider = llm_config.get("provider", settings.DEFAULT_PROVIDER)
    model = llm_config.get("model", settings.DEFAULT_MODEL)
    
    return LLMIntegration(provider=provider, model=model)

def get_prompt_generator(llm: LLMIntegration = Depends(get_llm)):
    """Initialize and return the prompt generator."""
    return PromptGenerator(provider=llm.provider)

# API Request/Response Models
class TextRequest(BaseModel):
    text: str

class QueryRequest(BaseModel):
    query: str
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 1000

class AnonymizedResponse(BaseModel):
    anonymized_text: str
    sensitivity_report: Dict[str, List[str]]
    formatted_report: str

class DeanonymizedResponse(BaseModel):
    original_text: str

class PlaceholderMappingItem(BaseModel):
    original_value: str
    placeholder: str

class FullQueryResponse(BaseModel):
    original_query: str
    anonymized_query: str
    sensitivity_report: Dict[str, List[str]]
    placeholder_mapping: Dict[str, List[PlaceholderMappingItem]]
    formatted_report: str
    llm_response: str
    deanonymized_response: str

# Define models for custom terms
class CustomTermRequest(BaseModel):
    term: str
    category: str

class CustomTermsResponse(BaseModel):
    terms: Dict[str, List[str]]

# API Endpoints
@app.get("/")
async def root():
    return {
        "message": "NLP Data Anonymizer API is running",
        "docs": "/docs",
        "provider": config.get("llm", {}).get("provider", settings.DEFAULT_PROVIDER)
    }

@app.post("/anonymize", response_model=AnonymizedResponse)
async def anonymize_text(
    request: Optional[TextRequest] = Body(None),
    text: Optional[str] = Query(None),
    anonymizer: NLPDataAnonymizer = Depends(get_anonymizer)
):
    """
    Analyze and anonymize sensitive data in text.
    
    You can provide the text either in the request body as a JSON object or as a form parameter.
    """
    # Get text from either request body or direct parameter
    input_text = text
    if request:
        input_text = request.text
    
    if not input_text:
        raise HTTPException(
            status_code=422, 
            detail="No text provided. Please provide 'text' either in the request body or as a parameter."
        )
    
    try:
        # Analyze sensitivity
        sensitivity_report = anonymizer.analyze_sensitivity(input_text)
        
        # Anonymize text
        anonymized_text = anonymizer.anonymize(input_text)
        
        # Save mappings
        if config.get("anonymizer", {}).get("save_mappings", True):
            save_anonymizer_state(anonymizer)
            
        return {
            "anonymized_text": anonymized_text,
            "sensitivity_report": sensitivity_report,
            "formatted_report": format_sensitivity_report(sensitivity_report)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error anonymizing text: {str(e)}")

@app.post("/deanonymize", response_model=DeanonymizedResponse)
async def deanonymize_text(
    request: Optional[TextRequest] = Body(None),
    text: Optional[str] = Query(None),
    anonymizer: NLPDataAnonymizer = Depends(get_anonymizer)
):
    """
    Restore original values in anonymized text.
    
    You can provide the text either in the request body as a JSON object or as a form parameter.
    """
    # Get text from either request body or direct parameter
    input_text = text
    if request:
        input_text = request.text
    
    if not input_text:
        raise HTTPException(
            status_code=422, 
            detail="No text provided. Please provide 'text' either in the request body or as a parameter."
        )
    
    try:
        # Deanonymize text
        original_text = anonymizer.deanonymize(input_text)
        
        return {"original_text": original_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deanonymizing text: {str(e)}")

@app.post("/query", response_model=FullQueryResponse)
async def process_query(
    request: Optional[QueryRequest] = Body(None),
    query: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    temperature: Optional[float] = Query(None),
    max_tokens: Optional[int] = Query(None),
    anonymizer: NLPDataAnonymizer = Depends(get_anonymizer),
    llm: LLMIntegration = Depends(get_llm),
    prompt_generator: PromptGenerator = Depends(get_prompt_generator)
):
    """
    Process a query through the full pipeline:
    1. Analyze and anonymize the query
    2. Generate prompts for the LLM
    3. Get response from LLM
    4. Deanonymize the response
    
    You can provide the query either in the request body as a JSON object or as form parameters.
    """
    # Initialize parameters from either the request body or direct parameters
    input_query = query
    input_provider = provider
    input_model = model
    input_temperature = temperature
    input_max_tokens = max_tokens
    
    # If request object is provided, use its values
    if request:
        input_query = request.query
        if not input_provider:
            input_provider = request.provider
        if not input_model:
            input_model = request.model
        if not input_temperature:
            input_temperature = request.temperature
        if not input_max_tokens:
            input_max_tokens = request.max_tokens
    
    # Check if query is provided
    if not input_query:
        raise HTTPException(
            status_code=422, 
            detail="No query provided. Please provide 'query' either in the request body or as a parameter."
        )
    
    try:
        # Override LLM settings if provided
        if input_provider:
            llm = LLMIntegration(provider=input_provider, model=input_model)
            prompt_generator = PromptGenerator(provider=input_provider)
            
        # 1. Analyze and anonymize the query
        sensitivity_report = anonymizer.analyze_sensitivity(input_query)
        anonymized_query = anonymizer.anonymize(input_query)
        
        # 2. Generate prompts for the LLM
        system_prompt = prompt_generator.generate_system_prompt(sensitivity_report)
        user_prompt = prompt_generator.generate_user_prompt(anonymized_query)
        
        # 3. Get response from LLM
        temp = input_temperature or config.get("llm", {}).get("temperature", 0.7)
        tokens = input_max_tokens or config.get("llm", {}).get("max_tokens", 1000)
        
        llm_response = llm.generate_response(
            prompt=user_prompt,
            system_message=system_prompt,
            temperature=temp,
            max_tokens=tokens
        )
        
        # 4. Deanonymize the response
        deanonymized_response = anonymizer.deanonymize(llm_response)
        
        # 5. Save mappings
        if config.get("anonymizer", {}).get("save_mappings", True):
            save_anonymizer_state(anonymizer)
        
        return {
            "original_query": input_query,
            "anonymized_query": anonymized_query,
            "sensitivity_report": sensitivity_report,
            "placeholder_mapping": get_placeholder_mapping(anonymizer),
            "formatted_report": format_sensitivity_report(sensitivity_report),
            "llm_response": llm_response,
            "deanonymized_response": deanonymized_response
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")

# Additional simplified routes
@app.get("/anonymize/{text}", response_model=AnonymizedResponse)
async def anonymize_text_get(
    text: str,
    anonymizer: NLPDataAnonymizer = Depends(get_anonymizer)
):
    """Simple GET route to anonymize text passed directly in the path."""
    try:
        # Analyze sensitivity
        sensitivity_report = anonymizer.analyze_sensitivity(text)
        
        # Anonymize text
        anonymized_text = anonymizer.anonymize(text)
        
        # Save mappings
        if config.get("anonymizer", {}).get("save_mappings", True):
            save_anonymizer_state(anonymizer)
            
        return {
            "anonymized_text": anonymized_text,
            "sensitivity_report": sensitivity_report,
            "formatted_report": format_sensitivity_report(sensitivity_report)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error anonymizing text: {str(e)}")

@app.get("/deanonymize/{text}", response_model=DeanonymizedResponse)
async def deanonymize_text_get(
    text: str,
    anonymizer: NLPDataAnonymizer = Depends(get_anonymizer)
):
    """Simple GET route to deanonymize text passed directly in the path."""
    try:
        # Deanonymize text
        original_text = anonymizer.deanonymize(text)
        
        return {"original_text": original_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deanonymizing text: {str(e)}")

@app.get("/query/{query}", response_model=FullQueryResponse)
async def process_query_get(
    query: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    anonymizer: NLPDataAnonymizer = Depends(get_anonymizer),
    llm: LLMIntegration = Depends(get_llm),
    prompt_generator: PromptGenerator = Depends(get_prompt_generator)
):
    """Simple GET route to process a query passed directly in the path."""
    try:
        # Override LLM settings if provided
        if provider:
            llm = LLMIntegration(provider=provider, model=model)
            prompt_generator = PromptGenerator(provider=provider)
            
        # 1. Analyze and anonymize the query
        sensitivity_report = anonymizer.analyze_sensitivity(query)
        anonymized_query = anonymizer.anonymize(query)
        
        # 2. Generate prompts for the LLM
        system_prompt = prompt_generator.generate_system_prompt(sensitivity_report)
        user_prompt = prompt_generator.generate_user_prompt(anonymized_query)
        
        # 3. Get response from LLM
        temp = temperature or config.get("llm", {}).get("temperature", 0.7)
        tokens = max_tokens or config.get("llm", {}).get("max_tokens", 1000)
        
        llm_response = llm.generate_response(
            prompt=user_prompt,
            system_message=system_prompt,
            temperature=temp,
            max_tokens=tokens
        )
        
        # 4. Deanonymize the response
        deanonymized_response = anonymizer.deanonymize(llm_response)
        
        # 5. Save mappings
        if config.get("anonymizer", {}).get("save_mappings", True):
            save_anonymizer_state(anonymizer)
        
        return {
            "original_query": query,
            "anonymized_query": anonymized_query,
            "sensitivity_report": sensitivity_report,
            "placeholder_mapping": get_placeholder_mapping(anonymizer),
            "formatted_report": format_sensitivity_report(sensitivity_report),
            "llm_response": llm_response,
            "deanonymized_response": deanonymized_response
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")

@app.get("/custom_terms", response_model=CustomTermsResponse)
async def get_custom_terms(anonymizer: NLPDataAnonymizer = Depends(get_anonymizer)):
    """
    Retrieve all custom terms that have been added for anonymization.
    """
    try:
        # Return the domain-specific terms from the anonymizer
        # Convert sets to lists for JSON serialization
        terms = {
            k: list(v) for k, v in anonymizer.custom_detector.domain_specific_terms.items()
        }
        
        return {"terms": terms}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving custom terms: {str(e)}")

@app.post("/add_custom_term")
async def add_custom_term(
    request: CustomTermRequest,
    anonymizer: NLPDataAnonymizer = Depends(get_anonymizer)
):
    """
    Add a custom term to be anonymized in future queries.
    
    Args:
        request: CustomTermRequest with term and category
    """
    try:
        # Add the term to the anonymizer
        anonymizer.custom_detector.add_single_term(request.category, request.term)
        
        # Save the updated state
        if config.get("anonymizer", {}).get("save_mappings", True):
            save_anonymizer_state(anonymizer)
            
        return {"message": f"Successfully added term '{request.term}' to category '{request.category}'"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding custom term: {str(e)}")

# Run with: uvicorn api_service.main:app --reload
# Access the API docs at: http://127.0.0.1:8000/docs
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)