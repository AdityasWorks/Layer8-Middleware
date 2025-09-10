console.log("AI Prompt Privacy Protector content script loaded.");
console.log("formatMessage available:", typeof window.formatMessage);

// EXTENSION CHECK
chrome.storage.sync.get('enabled', function (data) {
  const isEnabled = data.enabled !== undefined ? data.enabled : config.defaults.enabled;

  if (isEnabled) {
    console.log("AI Prompt Privacy Protector is enabled and running.");
    initializeExtension();
  } else {
    console.log("AI Prompt Privacy Protector is disabled.");
  }
});



// START EXTESNION - INITIALIZATION

function initializeExtension() {
  const API_URL = config.API_URL;

  // Detect which AI
  const isGemini = window.location.hostname.includes(config.platforms.GEMINI);
  const isChatGPT = window.location.hostname.includes(config.platforms.CHATGPT);
  const isGrok = window.location.hostname.includes(config.platforms.GROK);

  console.log(`Detected AI platform: ${isGemini ? 'Gemini' : (isChatGPT ? 'ChatGPT' : (isGrok ? 'Grok' : 'Unknown'))
    }`);




  // ANONYMIZE
  async function processPrompt(prompt) {
    try {
      // First, anonymize the prompt
      const response = await fetch(`${API_URL}/anonymize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt })
      });

      if (!response.ok) {
        throw new Error(`Anonymize API returned status ${response.status}`);
      }

      const result = await response.json();
      console.log("Anonymize API response:", result);

      const anonymizedText = result.anonymized_text || prompt;

      return {
        encryptedPrompt: anonymizedText,
        originalData: result.sensitivity_report || {}
      };
    } catch (error) {
      console.error(`Error calling API: ${error.message}`);
      return { encryptedPrompt: prompt, originalData: {} };
    }
  }

  
  
  
  //DEANONYMIZE
  async function deanonymizeResponse(responseText) {
    try {
      // Detect sensitive data tokens by pattern: DATATYPE_alphanumeric
      const tokenRegex = /\b(EMAIL|PHONE|SSN|CREDIT_CARD|IP_ADDRESS)_([a-zA-Z0-9]+)\b/g;

      // Find tokens before processing
      const foundTokens = responseText.match(tokenRegex) || [];
      console.log("Found tokens:", foundTokens);

      // If no tokens found, just return the original text
      if (foundTokens.length === 0) {
        console.log("%c⚠️ NO TOKENS FOUND TO DEANONYMIZE", "color: orange; font-weight: bold");
        return { deanonymized_text: responseText };
      }

      // Wrap all detected tokens with double underscores
      const processedText = responseText.replace(tokenRegex, '__$1_$2__');

      console.log("%cCALLING DEANONYMIZE API...", "color: blue; font-weight: bold");
      console.log("Using API URL:", API_URL);
      console.log("Processed text with tokens wrapped:", processedText);

      // Make the API call
      const response = await fetch(`${API_URL}/deanonymize`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: processedText })
      });

      if (!response.ok) {
        throw new Error(`Deanonymize API returned status ${response.status}`);
      }

      // Parse the response text first to debug
      const responseTextContent = await response.text();
      console.log("Raw API response text:", responseTextContent);

      // Try to parse as JSON
      let result;
      try {
        result = JSON.parse(responseTextContent);
      } catch (jsonError) {
        console.error("Failed to parse API response as JSON:", jsonError);
        // If we can't parse JSON, use the response text directly
        return { deanonymized_text: responseTextContent };
      }

      // Handle different response formats
      let deanonymizedText = null;

      if (result.deanonymized_text) {
        deanonymizedText = result.deanonymized_text;
      } else if (result.text) {
        deanonymizedText = result.text;
      } else if (typeof result === 'string') {
        deanonymizedText = result;
      } else {
        // Try to find any likely text property
        for (const key in result) {
          if (typeof result[key] === 'string' && result[key].length > 20) {
            deanonymizedText = result[key];
            break;
          }
        }
      }

      // Show the result
      if (deanonymizedText) {
        console.log("%c🔓 DEANONYMIZED TEXT:", "color: white; background-color: #10a37f; font-size: 14px; padding: 5px; border-radius: 3px;");
        console.log(deanonymizedText);
        return { deanonymized_text: deanonymizedText, original_response: result };
      } else {
        console.log("%c COULDN'T EXTRACT DEANONYMIZED TEXT", "color: white; background-color: #e34c26; font-size: 14px; padding: 5px;");
        console.log("API response structure:", result);
        return { original_response: result };
      }
    } catch (error) {
      console.error(`%c❌ ERROR:`, "color: red; font-weight: bold", error);
      return { error: error.message };
    }
  }






  // WHICH SITE
  
  function setupPromptListener() {
    if (isGemini) {
      setupGeminiInterface();
    } else if (isChatGPT) {
      setupChatGPTInterface();
    } else if (isGrok) {
      setupGrokInterface();
    }
  }


  // SET UP ENCRYPTION BUTTON
  //CUSTOM BUTTON ADD

  // FOR CHATGPT UI
  function setupChatGPTInterface() {
    const promptTextarea = document.getElementById("prompt-textarea");
    if (!promptTextarea) return;

    console.log("ChatGPT prompt textarea found");

    // Create encrypt button with styling
    const encryptButton = createEncryptButton();

    // Find the parent container and add the button
    attachButtonToChatGPTInterface(promptTextarea, encryptButton);

    // Set up event listeners and button behavior
    setupButtonBehavior(promptTextarea, encryptButton);

    // Initial check for existing content
    updateButtonVisibility(promptTextarea, encryptButton);

    // We found the textarea, no need to keep observing
    observer.disconnect();
  }


  // FOR GEMINI UI
  function setupGeminiInterface() {
    // Gemini uses a contentEditable div inside rich-textarea
    const promptTextarea = document.querySelector('.ql-editor[contenteditable="true"][data-placeholder="Ask Gemini"]');
    if (!promptTextarea) return;

    console.log("Gemini prompt textarea found");

    // Create encrypt button with styling adjusted for Gemini
    const encryptButton = createEncryptButton(true);

    // Find the parent container and add the button
    attachButtonToGeminiInterface(promptTextarea, encryptButton);

    // Set up event listeners and button behavior
    setupButtonBehavior(promptTextarea, encryptButton);

    // Initial check for existing content
    updateButtonVisibility(promptTextarea, encryptButton);

    // We found the textarea, no need to keep observing
    observer.disconnect();
  }


  // FOR GROK UI
  function setupGrokInterface() {
    // Grok uses a textarea inside a query-bar class
    const promptTextarea = document.querySelector('.query-bar textarea[aria-label="Ask Grok anything"]');
    if (!promptTextarea) return;

    console.log("Grok prompt textarea found");

    // Create encrypt button with styling adjusted for Grok
    const encryptButton = createEncryptButton(false, true);

    // Find the parent container and add the button
    attachButtonToGrokInterface(promptTextarea, encryptButton);

    // Set up event listeners and button behavior
    setupButtonBehavior(promptTextarea, encryptButton);

    // Initial check for existing content
    updateButtonVisibility(promptTextarea, encryptButton);

    observer.disconnect();
  }




  // STYLING FOR ENCRYPT BUTTON

  /**
   * Creates and styles the encrypt button
   * @param {boolean} isGemini - Whether this button is for Gemini interface
   * @param {boolean} isGrok - Whether this button is for Grok interface
   */
  function createEncryptButton(isGemini = false, isGrok = false) {
    const encryptButton = document.createElement("button");
    encryptButton.textContent = "Encrypt";
    encryptButton.id = "encrypt-button";
    encryptButton.type = "button";
    encryptButton.className = "encrypt-button";

    if (isGemini) {
      // Gemini-specific styling
      encryptButton.style.cssText = `
        display: inline-flex;
        height: 32px;
        align-items: center;
        justify-content: center;
        border-radius: 20px;
        border: 1px solid rgba(0, 0, 0, 0.1);
        background-color: transparent;
        color: rgb(26, 232, 150);
        font-size: 14px;
        font-weight: 500;
        padding: 0 12px;
        margin-right: 8px;
        cursor: pointer;
        transition: all 0.2s;
      `;

      // Hover effects for Gemini
      encryptButton.onmouseover = () => {
        encryptButton.style.backgroundColor = "rgba(26, 232, 174, 0.1)";
      };
      encryptButton.onmouseout = () => {
        encryptButton.style.backgroundColor = "transparent";
      };
    } else if (isGrok) {
      // Grok-specific styling - matches the Grok UI theme
      encryptButton.style.cssText = `
        display: inline-flex;
        height: 36px;
        align-items: center;
        justify-content: center;
        border-radius: 18px;
        border: 1px solid var(--toggle-border, rgba(0, 0, 0, 0.1));
        background-color: transparent;
        color: rgb(26, 232, 150);
        font-size: 14px;
        font-weight: 500;
        padding: 0 14px;
        margin-right: 6px;
        cursor: pointer;
        transition: all 0.2s;
      `;

      // Hover effects for Grok
      encryptButton.onmouseover = () => {
        encryptButton.style.backgroundColor = "rgba(26, 232, 174, 0.1)";
      };
      encryptButton.onmouseout = () => {
        encryptButton.style.backgroundColor = "transparent";
      };
    } else {
      // ChatGPT styling (default)
      encryptButton.style.cssText = `
        display: inline-flex;
        height: 28px;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
        border: 1px solid rgba(0,0,0,0.1);
        background-color: transparent;
        color: #10a37f;
        font-size: 13px;
        font-weight: 500;
        padding: 0 12px;
        margin-right: 6px;
        cursor: pointer;
        transition: all 0.2s;
      `;

      // Hover effects for ChatGPT
      encryptButton.onmouseover = () => {
        encryptButton.style.backgroundColor = "rgba(16, 163, 127, 0.1)";
      };
      encryptButton.onmouseout = () => {
        encryptButton.style.backgroundColor = "transparent";
      };
    }

    return encryptButton;
  }



function attachButtonToChatGPTInterface(promptTextarea, encryptButton) {
  // Look for the new composer footer actions container
  const footerActions = document.querySelector('[data-testid="composer-footer-actions"]');
  
  if (footerActions) {
    // Insert our button at the beginning of the footer actions
    footerActions.insertBefore(encryptButton, footerActions.firstChild);
    return;
  }
  
  // Fallback: look for the container with file upload and tool buttons
  const actionsContainer = document.querySelector('.flex.items-center[style*="margin-right: 102px"]');
  
  if (actionsContainer) {
    // Insert our button at the beginning
    actionsContainer.insertBefore(encryptButton, actionsContainer.firstChild);
    return;
  }
  
  // Second fallback: try to find any container near the prompt area
  const composerParent = promptTextarea.closest('.relative.flex.w-full.items-end');
  if (composerParent) {
    const actionsDiv = composerParent.querySelector('.bg-primary-surface-primary .flex.items-center');
    if (actionsDiv) {
      actionsDiv.insertBefore(encryptButton, actionsDiv.firstChild);
      return;
    }
  }
}

  // Attaches the button to the Gemini interface

  function attachButtonToGeminiInterface(promptTextarea, encryptButton) {

    // Alternative: add near the mic/send buttons
    const actionsWrapper = document.querySelector('.trailing-actions-wrapper');
    if (actionsWrapper) {
      // Create a container similar to other Gemini buttons
      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = `
        display: inline-flex;
        margin-right: 8px;
      `;
      buttonContainer.appendChild(encryptButton);
      actionsWrapper.insertBefore(buttonContainer, actionsWrapper.firstChild);
      return;
    }
  }

  // Attaches the button to the Grok interface

  function attachButtonToGrokInterface(promptTextarea, encryptButton) {
    // Try to find the buttons container in Grok's UI
    const buttonsContainer = promptTextarea.closest('.query-bar')?.querySelector('.flex.gap-1\\.5.max-w-full');

    if (buttonsContainer) {
      // Insert our button at the beginning of the toolbar
      buttonsContainer.insertBefore(encryptButton, buttonsContainer.firstChild);
      return;
    }

    // Find the DeepSearch button to place ours next to it
    const deepSearchButton = document.querySelector('button[aria-label="DeepSearch"]');
    if (deepSearchButton && deepSearchButton.parentNode) {
      deepSearchButton.parentNode.insertBefore(encryptButton, deepSearchButton);
      return;
    }
  }





  // TEXT AREA EVENTLISTENERS

  function setupButtonBehavior(promptTextarea, encryptButton) {

    // Function to update button visibility based on textarea content
    const updateVisibility = () => updateButtonVisibility(promptTextarea, encryptButton);

    // Add event listeners for both typing and pasting
    promptTextarea.addEventListener("input", updateVisibility);
    promptTextarea.addEventListener("paste", () => setTimeout(updateVisibility, 10));

    // Platform-specific event handling
    if (isGemini) {
      promptTextarea.addEventListener("blur", updateVisibility);
      promptTextarea.addEventListener("focus", updateVisibility);
    } else if (isGrok) {
      // Add specific event listeners for Grok if needed
      promptTextarea.addEventListener("blur", updateVisibility);
      promptTextarea.addEventListener("focus", updateVisibility);
    }


    // ENCRYPT BUTTON HANDLE SUBMIT 
    encryptButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      console.log("Encrypt button clicked"); // Confirm handler is being called

      // Temporarily disable button to prevent double-clicks
      encryptButton.disabled = true;
      const originalButtonText = encryptButton.textContent;
      encryptButton.textContent = "Processing...";

      try {
        // Always get a fresh reference to the textarea/input element
        let promptElement;
        if (isGemini) {
          promptElement = document.querySelector('.ql-editor[contenteditable="true"][data-placeholder="Ask Gemini"]');
        } else if (isGrok) {
          promptElement = document.querySelector('.query-bar textarea[aria-label="Ask Grok anything"]');
        } else {
          promptElement = document.getElementById("prompt-textarea");
        }

        // If we couldn't find the element, use the original reference
        if (!promptElement) {
          console.log("Using original prompt textarea reference");
          promptElement = promptTextarea;
        } else {
          console.log("Found fresh prompt textarea reference");
        }

        let originalPrompt;
        if (isGemini) {
          originalPrompt = promptElement.textContent || "";
        } else if (isGrok) {
          originalPrompt = promptElement.value || "";
        } else {
          originalPrompt = promptElement.value || promptElement.textContent || "";
        }

        console.log("Original prompt length:", originalPrompt.length);

        if (!originalPrompt) {
          console.log("No prompt text found!");
          return;
        }

        const result = await processPrompt(originalPrompt);
        console.log("API processing result:", result);

        if (result && result.encryptedPrompt) {
          console.log("Updating prompt with encrypted text");

          if (isGemini) {
            // Replace the content for Gemini
            promptElement.textContent = result.encryptedPrompt;
            promptElement.innerHTML = result.encryptedPrompt; // Add this line

            // Create a more robust event trigger
            setTimeout(() => {
              const inputEvent = new InputEvent("input", {
                bubbles: true,
                cancelable: true,
              });
              promptElement.dispatchEvent(inputEvent);

              // Force focus to ensure UI updates
              promptElement.focus();

              // Simulate a keypress to trigger Gemini's internal handlers
              const keypressEvent = new KeyboardEvent('keypress', { bubbles: true });
              promptElement.dispatchEvent(keypressEvent);
            }, 10);
          } else if (isGrok) {
            // Replace textarea content for Grok
            promptElement.value = result.encryptedPrompt;

            // Create a more comprehensive event cascade
            const events = ['input', 'change', 'keyup'];
            events.forEach(eventType => {
              const event = new Event(eventType, { bubbles: true });
              promptElement.dispatchEvent(event);
            });

            // Force resize of textarea if needed
            promptElement.style.height = 'auto';
            promptElement.style.height = promptElement.scrollHeight + 'px';
          } else {
            // For ChatGPT - find the ProseMirror element which is the actual editable content
            const proseMirror = document.querySelector('.ProseMirror#prompt-textarea');
        
            if (proseMirror) {
                // First, clear existing content properly
                proseMirror.innerHTML = '';
        
                // Create a new paragraph element with the encrypted text
                const paragraph = document.createElement('p');
                paragraph.textContent = result.encryptedPrompt;
                proseMirror.appendChild(paragraph);
        
                // Force multiple events with delays to ensure React registers the changes
                setTimeout(() => {
                    try {
                        // Simulate a user typing input
                        const inputEvent = new InputEvent('input', {
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                        });
                        proseMirror.dispatchEvent(inputEvent);
        
                        // Focus the element
                        proseMirror.focus();
        
                        // Set cursor position to the end safely
                        try {
                            const selection = window.getSelection();
                            const range = document.createRange();
                            
                            // Make sure the paragraph is still in the document
                            if (paragraph.isConnected) {
                                // Place cursor at end of text
                                const textNode = paragraph.firstChild;
                                if (textNode) {
                                    range.setStart(textNode, textNode.length);
                                    range.setEnd(textNode, textNode.length);
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                }
                            }
                        } catch (selectionError) {
                            console.warn("Failed to set cursor position:", selectionError);
                        }
        
                        // Dispatch additional events
                        ['change', 'keyup', 'blur', 'focus'].forEach(eventType => {
                            proseMirror.dispatchEvent(new Event(eventType, { bubbles: true }));
                        });
                    } catch (error) {
                        console.warn("Error updating ChatGPT textarea:", error);
                    }
                }, 10);
            } else {
                // Fallback to the old method if ProseMirror isn't found
                promptElement.value = result.encryptedPrompt;
                const events = ['input', 'change', 'keyup'];
                events.forEach(eventType => {
                    promptElement.dispatchEvent(new Event(eventType, { bubbles: true }));
                });
            }
        }

          console.log("Prompt updated successfully with:", result.encryptedPrompt.substring(0, 30) + "...");
        } else {
          console.log("No changes made to prompt");
        }
      } catch (error) {
        console.error("Error in encrypt button handler:", error);
      } finally {
        // Re-enable the button and restore text
        encryptButton.disabled = false;
        encryptButton.textContent = originalButtonText;

        // Update button visibility based on current content
        updateButtonVisibility(promptTextarea, encryptButton);
      }
    });
  }



  // ONLY SHOW BUTTON WHEN TEXT PRESENT IN THE TEXTAREA

  function updateButtonVisibility(promptTextarea, encryptButton) {
    let hasContent;

    if (isGemini) {
      // For Gemini, check the textContent
      hasContent = (promptTextarea.textContent || "").trim().length > 0;
      // Check if the div only contains a <br> but no actual text
      if (hasContent && promptTextarea.innerHTML.trim() === '<br>' ||
        promptTextarea.innerHTML.trim().includes('data-placeholder')) {
        hasContent = false;
      }
    } else if (isGrok) {
      // For Grok, check the textarea value
      hasContent = (promptTextarea.value || "").trim().length > 0;
    } else {
      // For ChatGPT check both value and textContent
      hasContent = (promptTextarea.value || promptTextarea.textContent || "").trim().length > 0;
    }

    encryptButton.style.display = hasContent ? "block" : "none";
  }


  // Add a flag to control console logging frequency
  let shouldLogContainers = true;


  // Update the addButtonsToResponseActions function
  function addButtonsToResponseActions() {
    if (!isChatGPT) return;

    // Use a more specific selector matching the HTML structure you shared
    const actionContainers = document.querySelectorAll('.flex.justify-start > div');

    // Only log occasionally
    if (shouldLogContainers) {
      console.log(`Found ${actionContainers.length} action containers`);
      shouldLogContainers = false;
      // Reset the flag after 5 seconds
      setTimeout(() => {
        shouldLogContainers = true;
      }, 5000);
    }

    actionContainers.forEach(container => {
      // Skip if already added
      if (container.querySelector('.layer8-action-btn')) return;

      // Create button wrapper span like the other buttons
      const buttonSpan = document.createElement('span');
      buttonSpan.className = '';
      buttonSpan.setAttribute('data-state', 'closed');

      // Create the actual button
      const button = document.createElement('button');
      button.className = 'text-token-text-secondary hover:bg-token-main-surface-secondary rounded-lg layer8-action-btn';
      button.setAttribute('aria-label', 'Process with Layer8');

      // Add the icon span
      const buttonContent = document.createElement('span');
      buttonContent.className = 'touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center';
      buttonContent.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-md-heavy">
          <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor"></path>
          <path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="2"></path>
          <path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="2"></path>
        </svg>

      `;

      button.appendChild(buttonContent);
      buttonSpan.appendChild(button);

      // Insert before the model selector (last button)
      container.appendChild(buttonSpan);

      // Only log when actually adding a button
      console.log('Added Layer8 button to response actions');

      button.addEventListener('click', async () => {
        try {
          const responseElement = container.closest('[data-message-author-role="assistant"]') ||
            container.closest('.agent-turn');

          if (responseElement) {
            const responseText = responseElement.querySelector('.markdown');

            if (responseText && responseText.textContent) {
              console.log('Processing response with Layer8...');

              // Show visual feedback that we're processing
              const originalTextContent = responseText.textContent;
              responseText.style.opacity = '0.6';

              // Enhanced regex to detect all token patterns including:
              // - Regular tokens: EMAIL_6030cb23
              // - Tokens with underscores: __EMAIL_6030cb23__, ___EMAIL_6030cb23___
              // - Malformed tokens: ___PHONE_c260e284___260e284___
              // - Added PERSON type
              const tokenRegex = /_{0,3}(EMAIL|PHONE|SSN|CREDIT_CARD|IP_ADDRESS|PERSON|ORGANIZATION|LOCATION|DATE)_([a-zA-Z0-9]+)_{0,3}/g;
              const text = responseText.textContent;

              // Replace tokens with wrapped versions - ensure consistent format with triple underscores
              const modifiedText = text.replace(tokenRegex, (match, type, id) => {
                // Extract just the type and ID, removing any surrounding underscores
                return `___${type}_${id}___`;
              });

              console.log("Sending to API:", modifiedText.substring(0, 50) + "...");


              try {
                // Always use POST method since GET returns 405
                console.log("Using POST method for API call");
                const response = await fetch(`${API_URL}/deanonymize`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: modifiedText })
                });

                if (!response.ok) {
                  throw new Error(`Deanonymize API returned status ${response.status}`);
                }

                const responseContent = await response.text();
                console.log("Raw API response:", responseContent);

                // Try to parse the response as JSON
                try {
                  const jsonResponse = JSON.parse(responseContent);
                  console.log("%c API RESPONSE:", "color: white; background-color: #10a37f; font-size: 14px; padding: 5px;");

                  // Extract any text field that might contain the deanonymized content
                  let deanonymizedText = jsonResponse.deanonymized_text ||
                    jsonResponse.text ||
                    jsonResponse.original_text;

                  if (deanonymizedText) {
                    console.log("%c DEANONYMIZED TEXT:", "color: black; background-color: #ffeb3b; font-size: 14px; padding: 5px;");
                    console.log(deanonymizedText);
    


                    // UPDATE THE ACTUAL DOM ELEMENT WITH DEANONYMIZED TEXT
                    try {
                    responseText.innerHTML = '';
                    console.log("Calling formatMessage with text:", deanonymizedText.substring(0, 100) + "...");
                    
                    // textFormatter.js now handles the plain text to markdown conversion automatically
                    formatMessage(deanonymizedText, responseText);
                    console.log("formatMessage completed successfully");
                  } catch (formatError) {
                    console.error("Error in formatMessage:", formatError);
                    responseText.textContent = deanonymizedText;
                  }

                    // Add a visual indicator that the text has been deanonymized
                    responseText.style.opacity = '1';
                    responseText.style.backgroundColor = 'rgba (33, 32, 33, 1)';
                    responseText.style.padding = '8px';
                    responseText.style.borderRadius = '6px';
                    responseText.style.transition = 'all 0.3s ease';
                    // responseText.style.boxShadow = '0 1px 4px rgba(0,0,0,0.1)';

                    // Create a small indicator badge
                    const badge = document.createElement('div');
                    badge.style.cssText = `
                      position: absolute;
                      bottom: -25px;
                      right: 0;
                      background-color: #10a37f;
                      color: white;
                      border-radius: 4px;
                      padding: 3px 8px;
                      font-size: 11px;
                      font-weight: bold;
                      z-index: 1;
                      margin-top: 8px;
                    `;
                    badge.textContent = 'Decrypted';

                    // Make sure the response container has relative positioning
                    if (responseElement.style.position !== 'relative') {
                      responseElement.style.position = 'relative';
                    }

                    responseElement.appendChild(badge);
                  } else {
                    // Just log the whole response if we can't find a specific field
                    console.log(jsonResponse);
                    // Restore original appearance
                    responseText.style.opacity = '1';
                  }
                } catch (jsonError) {
                  // If not JSON, display the raw text
                  console.log("%c✅ API RESPONSE (TEXT):", "color: white; background-color: #10a37f; font-size: 14px; padding: 5px;");
                  console.log(responseContent);
                  // Try to use the raw text as response
                  responseText.innerHTML = responseContent;
                  responseText.style.opacity = '1';
                }
              } catch (apiError) {
                console.error('Error during API call:', apiError);
                // Restore original appearance and text
                responseText.style.opacity = '1';
                responseText.textContent = originalTextContent;
              }
            }
          }
        } catch (error) {
          console.error('Unexpected error in button click handler:', error);
        }
      });
    });
  }



  // Run initially and periodically to catch new responses
  setTimeout(addButtonsToResponseActions, 1000);



  // Create a Mutation Observer to find the textarea when it loads
  const observer = new MutationObserver(() => {
    setupPromptListener();
  });

  observer.observe(document.body, { childList: true, subtree: true });



  // Also add this to your existing response observer
  const responseObserver = new MutationObserver((mutations) => {
    // Check if any new responses were added
    const shouldCheckForResponses = mutations.some(mutation =>
      mutation.addedNodes.length > 0 ||
      mutation.type === 'attributes' && mutation.target.classList.contains('agent-turn')
    );

    if (shouldCheckForResponses) {
      // Add buttons to responses
      addButtonsToResponseActions();
    }
  });

  responseObserver.disconnect();
  responseObserver.observe(document.body, {
    childList: true,
    subtree: true
  });



  // Intercept fetch requests to anonymize data before sending to API
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = args[0];
    const options = args[1] || {};

    // Process ChatGPT API requests
    if (isChatGPT && url.includes("chatgpt.com/backend-api/conversation") && typeof options.body === "string") {
      try {
        const parsedBody = JSON.parse(options.body);

        // Handle direct prompts
        if (parsedBody && typeof parsedBody.prompt === "string") {
          const { encryptedPrompt, originalData } = await processPrompt(parsedBody.prompt);
          if (Object.keys(originalData).length > 0) {
            parsedBody.prompt = encryptedPrompt;
            options.body = JSON.stringify(parsedBody);
          }
        }
        // Handle message arrays
        else if (parsedBody && Array.isArray(parsedBody.messages)) {
          for (const message of parsedBody.messages) {
            if (message && typeof message.content === "string") {
              const { encryptedPrompt, originalData } = await processPrompt(message.content);
              if (Object.keys(originalData).length > 0) {
                message.content = encryptedPrompt;
                options.body = JSON.stringify(parsedBody);
                break;
              }
            }
          }
        }
      } catch (e) {
        console.error("Error processing ChatGPT fetch request:", e);
      }
    }

    // Process Gemini API requests 
    if (isGemini && (url.includes("generativelanguage.googleapis.com") ||
      url.includes("gemini.google.com/api"))) {
      try {
        // Only process if it's a POST request with body
        if (options.method === "POST" && options.body) {
          const bodyContent = typeof options.body === "string" ?
            JSON.parse(options.body) : options.body;

          // Check for common Gemini API structures
          if (bodyContent.contents) {
            // Handle array of contents
            for (const content of bodyContent.contents) {
              if (content.parts) {
                for (const part of content.parts) {
                  if (part.text) {
                    const { encryptedPrompt, originalData } = await processPrompt(part.text);
                    if (Object.keys(originalData).length > 0) {
                      part.text = encryptedPrompt;
                      options.body = JSON.stringify(bodyContent);
                    }
                  }
                }
              }
            }
          } else if (bodyContent.prompt && bodyContent.prompt.text) {
            // Handle direct text prompts
            const { encryptedPrompt, originalData } = await processPrompt(bodyContent.prompt.text);
            if (Object.keys(originalData).length > 0) {
              bodyContent.prompt.text = encryptedPrompt;
              options.body = JSON.stringify(bodyContent);
            }
          }
        }
      } catch (e) {
        console.error("Error processing Gemini fetch request:", e);
      }
    }

    // Process Grok API requests
    if (isGrok && (url.includes("api.x.ai") ||
      url.includes("grok.x.ai/api") ||
      url.includes("grok.com/api"))) {
      try {
        // Only process if it's a POST request with body
        if (options.method === "POST" && options.body) {
          const bodyContent = typeof options.body === "string" ?
            JSON.parse(options.body) : options.body;

          // Check for common Grok API structures (may need adjusting based on actual API)
          if (bodyContent.message) {
            const { encryptedPrompt, originalData } = await processPrompt(bodyContent.message);
            if (Object.keys(originalData).length > 0) {
              bodyContent.message = encryptedPrompt;
              options.body = JSON.stringify(bodyContent);
            }
          } else if (bodyContent.messages && Array.isArray(bodyContent.messages)) {
            // Handle message array structure
            for (const message of bodyContent.messages) {
              if (message && typeof message.content === "string") {
                const { encryptedPrompt, originalData } = await processPrompt(message.content);
                if (Object.keys(originalData).length > 0) {
                  message.content = encryptedPrompt;
                  options.body = JSON.stringify(bodyContent);
                  break;
                }
              }
            }
          } else if (bodyContent.prompt) {
            // Handle prompt property
            const { encryptedPrompt, originalData } = await processPrompt(bodyContent.prompt);
            if (Object.keys(originalData).length > 0) {
              bodyContent.prompt = encryptedPrompt;
              options.body = JSON.stringify(bodyContent);
            }
          }
        }
      } catch (e) {
        console.error("Error processing Grok fetch request:", e);
      }
    }
    return originalFetch.apply(this, args);
  };
}