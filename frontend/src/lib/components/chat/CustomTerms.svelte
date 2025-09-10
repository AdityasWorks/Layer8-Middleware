<script lang="ts">
  import { onMount } from 'svelte';

  let term = '';
  let category = '';
  let isSubmitting = false;
  let message = '';
  let error = '';
  let showMessage = false;
  let isLoadingTerms = false;
  let customTerms: Record<string, string[]> = {};
  let showExistingTerms = false;
  let file: File | null = null;

  const API_URL = 'http://localhost:8000';
  
  const categories = [
    'PERSON',
    'ORGANIZATION',
    'LOCATION',
    'PROJECT',
    'PRODUCT',
    'CUSTOM',
    'OTHER'
  ];

  onMount(() => {
    fetchCustomTerms();
  });

  async function fetchCustomTerms() {
    isLoadingTerms = true;
    try {
      const response = await fetch(`${API_URL}/custom_terms`);
      
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      
      const data = await response.json();
      customTerms = data.terms;
    } catch (err: any) {
      console.error('Error fetching custom terms:', err);
      error = `Failed to load custom terms: ${err.message}`;
      showMessage = true;
      setTimeout(() => { showMessage = false; }, 3000);
    } finally {
      isLoadingTerms = false;
    }
  }

  async function addCustomTerm() {
    if (!term.trim() || !category.trim()) {
      error = 'Both term and category are required';
      showMessage = true;
      setTimeout(() => { showMessage = false; }, 3000);
      return;
    }

    isSubmitting = true;
    error = '';
    message = '';

    try {
      const response = await fetch(`${API_URL}/add_custom_term`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          term: term.trim(),
          category: category.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        message = data.message;
        term = '';
        category = 'CUSTOM';
        
        // Reload custom terms
        await fetchCustomTerms();
      } else {
        error = data.detail || 'Error adding custom term';
      }
    } catch (err: any) {
      error = `Error: ${err.message}. Make sure the API server is running.`;
    } finally {
      isSubmitting = false;
      showMessage = true;
      setTimeout(() => { showMessage = false; }, 3000);
    }
  }

  async function uploadFile() {
    if (!file) {
      error = 'Please select a file to upload';
      showMessage = true;
      setTimeout(() => { showMessage = false; }, 3000);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/custom_pii_using_rag`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();
      message = 'File uploaded successfully';
      // Handle the response data as needed
    } catch (err: any) {
      error = `Error uploading file: ${err.message}`;
    } finally {
      showMessage = true;
      setTimeout(() => { showMessage = false; }, 3000);
    }
  }

  function toggleExistingTerms() {
    showExistingTerms = !showExistingTerms;
  }
</script>

<div class="custom-terms-panel bg-purple-900 bg-opacity-50 backdrop-blur-lg rounded-xl p-4 shadow-lg border border-purple-700">
    <h3 class="text-xl font-semibold text-purple-100 mb-4 text-center">Custom Terms to Anonymize</h3>
    
    <div class="space-y-3">
      <div>
        <label for="term" class="block text-sm font-medium text-purple-200 mb-1">Term</label>
        <input
          type="text"
          id="term"
          bind:value={term}
          placeholder="Enter term to anonymize"
          class="w-full px-3 py-2 bg-purple-950 bg-opacity-70 text-purple-100 rounded-lg border border-purple-700 focus:ring-2 focus:ring-neon-purple focus:outline-none"
        />
      </div>
      
      <div>
        <label for="category" class="block text-sm font-medium text-purple-200 mb-1">Category</label>
        <select
          id="category"
          bind:value={category}
          class="w-full px-3 py-2 bg-purple-950 bg-opacity-70 text-purple-100 rounded-lg border border-purple-700 focus:ring-2 focus:ring-neon-purple focus:outline-none"
        >
          <option value="" disabled>Select a category</option>
          {#each categories as cat}
            <option value={cat}>{cat}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="file" class="block text-sm font-medium text-purple-200 mb-1">Upload File</label>
        <input
          type="file"
          id="file"
          on:change={(e) => file = e.target.files[0]}
          class="w-full px-3 py-2 bg-purple-950 bg-opacity-70 text-purple-100 rounded-lg border border-purple-700 focus:ring-2 focus:ring-neon-purple focus:outline-none"
        />
      </div>
  
      <button
        on:click={uploadFile}
        class="w-full px-4 py-2 bg-gradient-to-r from-neon-purple to-neon-blue hover:opacity-90 text-white font-medium rounded-lg shadow transition-all flex items-center justify-center mt-2"
      >
        Upload File
      </button>
  
      <button
        on:click={addCustomTerm}
        disabled={isSubmitting}
        class="w-full px-4 py-2 bg-gradient-to-r from-neon-purple to-neon-blue hover:opacity-90 text-white font-medium rounded-lg shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {#if isSubmitting}
          <div class="h-4 w-4 border-t-2 border-b-2 border-white rounded-full animate-spin mr-2"></div>
          Adding...
        {:else}
          Add Term
        {/if}
      </button>
      
      {#if showMessage}
        <div class="mt-3">
          {#if message}
            <div class="bg-green-800 bg-opacity-40 text-green-200 p-2 rounded-md text-sm">
              ✓ {message}
            </div>
          {/if}
          
          {#if error}
            <div class="bg-red-800 bg-opacity-40 text-red-200 p-2 rounded-md text-sm">
              ✗ {error}
            </div>
          {/if}
        </div>
      {/if}
  
      <!-- Existing Terms Section -->
      <div class="mt-4 border-t border-purple-700 pt-3">
        <button 
          on:click={toggleExistingTerms}
          class="flex items-center justify-between w-full text-sm text-purple-200 hover:text-white"
        >
          <span>View Existing Custom Terms</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform" style="transform: rotate({showExistingTerms ? '90deg' : '0deg'})" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        
        {#if showExistingTerms}
          <div class="mt-3 bg-purple-950 bg-opacity-60 rounded-lg p-3 text-sm max-h-56 overflow-y-auto">
            {#if isLoadingTerms}
              <div class="flex justify-center py-3">
                <div class="h-5 w-5 border-t-2 border-b-2 border-purple-300 rounded-full animate-spin"></div>
              </div>
            {:else if Object.keys(customTerms).length === 0}
              <p class="text-purple-300 text-center py-2">No custom terms added yet</p>
            {:else}
              {#each Object.entries(customTerms) as [cat, terms]}
                {#if terms.length > 0}
                  <div class="mb-2">
                    <h4 class="text-neon-blue font-medium mb-1">{cat}</h4>
                    <ul class="pl-3 space-y-1">
                      {#each terms as term}
                        <li class="text-purple-200">• {term}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    </div>
    
    <div class="mt-4 text-xs text-purple-400">
      <p>Terms you add will be anonymized in all future conversations.</p>
    </div>
  </div> 