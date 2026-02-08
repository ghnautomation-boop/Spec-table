import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useOnboarding } from "./OnboardingContext";

export function OnboardingTour() {
  const {
    isActive,
    currentStepData,
    nextStep,
    previousStep,
    skipTour,
    hasNext,
    hasPrevious,
    progress,
    currentStep,
    steps,
  } = useOnboarding();
  const navigate = useNavigate();
  const location = useLocation();
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [targetElement, setTargetElement] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const overlayRef = useRef(null);
  const tooltipRef = useRef(null);

  // Navigate to step's route if needed (doar dacă allowAutoNavigate este true)
  useEffect(() => {
    if (!isActive || !currentStepData) return;

    // Doar navighează automat dacă step-ul permite asta
    if (currentStepData.allowAutoNavigate !== false && currentStepData.route && location.pathname !== currentStepData.route) {
      // Use replace: false to allow back navigation
      navigate(currentStepData.route, { replace: false });
    }
  }, [isActive, currentStepData, location.pathname, navigate]);

  // Reset collapsed state when step changes
  useEffect(() => {
    setIsCollapsed(false);
  }, [currentStepData?.stepNumber]);

  // Position tooltip near target element
  useEffect(() => {
    if (!isActive || !currentStepData) {
      setTargetElement(null);
      return;
    }


    const selector = currentStepData.target;
    if (!selector) {
      // Center on screen if no target
      setPosition({
        top: window.innerHeight / 2,
        left: window.innerWidth / 2,
      });
      setTargetElement(null);
      return;
    }

    // Wait for element to appear (especially after navigation)
    let retryCount = 0;
    const maxRetries = 50; // 5 seconds max wait time
    
    const findElement = () => {
      // Pentru step-ul 8, găsește container-ul care conține toate cele 3 butoane
      let element = null;
      let scrollElement = null;
      
      if (currentStepData.stepNumber === 8 && currentStepData.highlightMultiple) {
        // Găsește container-ul care conține toate cele 3 butoane
        const container = document.querySelector('div[data-onboarding="buttons-container"]');
        if (container) {
          scrollElement = container;
          // Găsește primul buton pentru target
          element = document.querySelector('s-button[data-onboarding="add-metafields"]');
        } else {
          element = document.querySelector(selector);
        }
      } else if (currentStepData.stepNumber === 11) {
        // Pentru step-ul 11 (stiluri), găsește div-ul care conține styles și preview
        element = document.querySelector('div[data-onboarding="styles-preview-container"]');
        if (!element) {
          // Fallback: găsește div-ul cu display flex care conține styles și preview
          const divs = document.querySelectorAll('div[style*="display: flex"]');
          for (const div of divs) {
            const style = div.getAttribute('style') || '';
            if (style.includes('gap: "20px"') || style.includes('gap: 20px')) {
              const hasStyles = div.textContent?.includes('Styles') || div.querySelector('s-section[heading="Styles"]');
              const hasPreview = div.textContent?.includes('Preview');
              if (hasStyles && hasPreview) {
                element = div;
                break;
              }
            }
          }
        }
      } else if (currentStepData.stepNumber === 12) {
        // Pentru step-ul 12 (Display Settings), găsește elementul HTML native din shadow root
        const section = document.querySelector('s-section[data-onboarding="display-settings-section"]');
        if (section) {
          // Accesează shadow root-ul s-section-ului
          const shadowRoot = section.shadowRoot;
          if (shadowRoot) {
            // Găsește elementul <section> HTML native din shadow root
            const htmlSection = shadowRoot.querySelector('section');
            if (htmlSection) {
              element = htmlSection;
            } else {
              // Fallback: găsește s-stack și apoi elementul HTML din el
              const stack = shadowRoot.querySelector('s-stack');
              if (stack && stack.shadowRoot) {
                const stackShadowRoot = stack.shadowRoot;
                const htmlStack = stackShadowRoot.querySelector('span.stack') || stackShadowRoot.querySelector('div');
                if (htmlStack) {
                  element = htmlStack;
                } else {
                  element = section;
                }
              } else {
                element = section;
              }
            }
          } else {
            element = section;
          }
        } else {
          element = document.querySelector(selector);
        }
      } else if (currentStepData.stepNumber === 13) {
        // Pentru step-ul 13 (Collapsible Table), găsește elementul HTML native din shadow root-ul s-switch
        const switchElement = document.querySelector('s-switch[data-onboarding="collapsible-table-switch"]');
        if (switchElement) {
          // Accesează shadow root-ul s-switch-ului
          const shadowRoot = switchElement.shadowRoot;
          if (shadowRoot) {
            // Găsește span-ul cu class="stack" din shadow root
            let span = shadowRoot.querySelector('span.stack');
            if (!span) {
              // Dacă nu găsește direct, caută în toate span-urile
              const allSpans = shadowRoot.querySelectorAll('span');
              for (const s of allSpans) {
                if (s.classList.contains('stack')) {
                  span = s;
                  break;
                }
              }
            }
            if (span) {
              element = span;
            } else {
              // Fallback: caută orice element HTML native (label, div, span, etc.)
              const htmlElement = shadowRoot.querySelector('label') || shadowRoot.querySelector('div') || shadowRoot.querySelector('span');
              if (htmlElement) {
                element = htmlElement;
              } else {
                // Ultimul fallback: folosește s-switch și aplică highlight pe el
                element = switchElement;
              }
            }
          } else {
            // Dacă nu are shadow root, folosește s-switch
            element = switchElement;
          }
        } else {
          element = document.querySelector(selector);
        }
      } else if (currentStepData.stepNumber === 15) {
        // Pentru step-ul 15, găsește butonul "Show" (nu "Edit")
        // Butonul "Show" este primul buton primary din fiecare template card care nu are data-onboarding="assign-template"
        const allButtons = document.querySelectorAll('s-button[variant="primary"]');
        for (const btn of allButtons) {
          // Sări peste butonul "Edit" care are data-onboarding="assign-template"
          if (btn.hasAttribute('data-onboarding') && btn.getAttribute('data-onboarding') === 'assign-template') {
            continue;
          }
          
          // Verifică dacă butonul conține textul "Show" sau "Hide"
          const shadowRoot = btn.shadowRoot;
          if (shadowRoot) {
            // Caută butonul HTML din shadow root
            const htmlButton = shadowRoot.querySelector('button');
            if (htmlButton) {
              const buttonText = htmlButton.textContent?.trim() || shadowRoot.textContent?.trim() || '';
              if (buttonText === 'Show' || buttonText === 'Hide') {
                // Pentru step-ul 15, folosim butonul HTML din shadow root pentru highlight
                element = htmlButton;
                break;
              }
            } else {
              // Dacă nu găsește butonul, verifică textContent din shadow root
              const buttonText = shadowRoot.textContent?.trim() || '';
              if (buttonText === 'Show' || buttonText === 'Hide') {
                element = btn;
                break;
              }
            }
          } else {
            // Dacă nu are shadow root, verifică textContent direct
            const buttonText = btn.textContent?.trim() || '';
            if (buttonText === 'Show' || buttonText === 'Hide') {
              element = btn;
              break;
            }
          }
        }
        // Fallback: folosește selectorul original
        if (!element) {
          element = document.querySelector(selector);
        }
      } else if (currentStepData.stepNumber === 6 || currentStepData.stepNumber === 7) {
        // Pentru step-urile 6 și 7, folosește selectorul specific cu data-onboarding
        if (currentStepData.stepNumber === 6) {
          element = document.querySelector('s-text-field[data-onboarding="template-name-input"]');
        } else if (currentStepData.stepNumber === 7) {
          element = document.querySelector('s-text-field[data-onboarding="section-name-input"]');
        }
        // Fallback: folosește selectorul original
        if (!element) {
          element = document.querySelector(selector);
        }
      } else {
        element = document.querySelector(selector);
      }
      
      if (element) {
        setTargetElement(element);
        // Wait a bit for DOM to settle, then update position and scroll
        setTimeout(() => {
          updatePosition(element);
          
          // Pentru step-ul 8, folosește container-ul pentru scroll
          const elementForScroll = scrollElement || element;
          
          // Scroll automat agresiv către element
          const scrollToElement = () => {
            const rect = elementForScroll.getBoundingClientRect();
            const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
            const viewportHeight = window.innerHeight;
            
            
            // Verifică dacă elementul este deja în viewport
            const isInViewport = rect.top >= 0 && rect.bottom <= viewportHeight;
            const isPartiallyVisible = rect.top < viewportHeight && rect.bottom > 0;
            
            // Pentru step-ul 7, scroll puțin mai jos
            const scrollOffset = currentStepData.stepNumber === 7 ? 100 : 0;
            
            if (!isInViewport || rect.top < 100 || rect.bottom > viewportHeight - 100 || currentStepData.stepNumber === 7) {
              // Scroll către element cu offset pentru a-l centra bine
              const targetScrollY = scrollY + rect.top - (viewportHeight / 2) + (rect.height / 2) + scrollOffset;
              
              
              window.scrollTo({
                top: Math.max(0, targetScrollY),
                behavior: "smooth",
              });
              
              // Alternativ, folosește scrollIntoView dacă window.scrollTo nu funcționează
              setTimeout(() => {
                elementForScroll.scrollIntoView({
                  behavior: "smooth",
                  block: currentStepData.stepNumber === 7 ? "start" : "center",
                  inline: "nearest",
                });
                // Pentru step-ul 7, scroll puțin mai jos după scrollIntoView
                if (currentStepData.stepNumber === 7) {
                  setTimeout(() => {
                    window.scrollBy({
                      top: scrollOffset,
                      behavior: "smooth",
                    });
                  }, 300);
                }
              }, 100);
            }
          };
          
          // Dacă step-ul are scrollToSection, face scroll mai agresiv
          if (currentStepData.scrollToSection) {
            scrollToElement();
            // Reîncearcă scroll după un delay pentru a se asigura că elementul e vizibil
            setTimeout(scrollToElement, 300);
            setTimeout(scrollToElement, 600);
          } else {
            // Scroll normal
            element.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            });
          }
        }, 200);
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          // Retry after a short delay
          setTimeout(findElement, 100);
        }
      }
    };

    // Start with a delay to allow navigation to complete
    // Pentru step-urile cu scrollToSection, așteaptă mai mult pentru ca DOM-ul să fie complet încărcat
    setTimeout(findElement, currentStepData.scrollToSection ? 600 : 300);
  }, [isActive, currentStepData, location.pathname]);

  const updatePosition = (element) => {
    const rect = element.getBoundingClientRect();
    // Use getBoundingClientRect which gives viewport-relative coordinates
    // No need to add scrollY/scrollX when using position: fixed

    // Position tooltip based on placement preference
    const placement = currentStepData.placement || "bottom";
    let top = rect.top;
    let left = rect.left;

    // Minimum left offset to account for Shopify sidebar (200px)
    const minLeft = 200;

    switch (placement) {
      case "top":
        top = rect.top - 20;
        left = Math.max(rect.left + rect.width / 2, minLeft);
        break;
      case "bottom":
        top = rect.bottom + 20;
        left = Math.max(rect.left + rect.width / 2, minLeft);
        break;
      case "left":
        top = rect.top + rect.height / 2;
        left = Math.max(rect.left - 20, minLeft);
        break;
      case "right":
        top = rect.top + rect.height / 2;
        left = Math.max(rect.right + 20, minLeft);
        break;
      case "center":
        top = window.innerHeight / 2;
        left = Math.max(window.innerWidth / 2, minLeft);
        break;
      default:
        top = rect.bottom + 20;
        left = Math.max(rect.left + rect.width / 2, minLeft);
    }

    setPosition({ top, left });
  };

  // Cleanup all existing highlights before applying new one
  useEffect(() => {
    // Cleanup toate highlight-urile existente când se schimbă step-ul
    const cleanupAllHighlights = () => {
      // Găsește toate wrapper-urile de onboarding
      const allWrappers = document.querySelectorAll('[data-onboarding-wrapper]');
      allWrappers.forEach(wrapper => {
        const textField = wrapper.querySelector('s-text-field');
        if (textField && wrapper.parentNode) {
          wrapper.parentNode.insertBefore(textField, wrapper);
          wrapper.remove();
          if (textField._onboardingWrapper) {
            delete textField._onboardingWrapper;
          }
        }
      });
      
      // Găsește toate elementele cu _onboardingWrapper
      const allTextFields = document.querySelectorAll('s-text-field');
      allTextFields.forEach(tf => {
        if (tf._onboardingWrapper) {
          const wrapper = tf._onboardingWrapper;
          if (wrapper.parentNode && tf.parentNode === wrapper) {
            wrapper.parentNode.insertBefore(tf, wrapper);
            wrapper.remove();
            delete tf._onboardingWrapper;
          }
        }
      });
      
      // Găsește toate s-button-urile cu _onboardingWrapper
      const allButtons = document.querySelectorAll('s-button');
      allButtons.forEach(btn => {
        if (btn._onboardingWrapper) {
          const wrapper = btn._onboardingWrapper;
          if (wrapper.parentNode && btn.parentNode === wrapper) {
            wrapper.parentNode.insertBefore(btn, wrapper);
            wrapper.remove();
            delete btn._onboardingWrapper;
          }
        }
      });

      // Cleanup highlight-uri de pe elemente HTML native (input, span, section, label, etc.)
      // Folosește o abordare mai agresivă pentru a găsi toate elementele highlighted
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        // Verifică dacă elementul are stiluri de highlight aplicate sau flag-ul _onboardingHighlighted
        const hasHighlight = el._onboardingHighlighted || 
                            el.style.border?.includes('#FFCC00') || 
                            el.style.outline?.includes('#FFCC00') ||
                            el.style.boxShadow?.includes('255, 204, 0');
        
        if (hasHighlight) {
          // Restaurează stilurile originale dacă există
          if (el._onboardingOriginalStyles) {
            Object.keys(el._onboardingOriginalStyles).forEach(prop => {
              el.style[prop] = el._onboardingOriginalStyles[prop];
            });
            delete el._onboardingOriginalStyles;
          } else {
            // Dacă nu avem stiluri originale salvate, șterge stilurile de highlight
            el.style.border = "";
            el.style.outline = "";
            el.style.outlineOffset = "";
            el.style.borderRadius = "";
            el.style.boxShadow = "";
            el.style.padding = "";
            el.style.position = "";
            el.style.zIndex = "";
            el.style.display = "";
          }
          delete el._onboardingHighlighted;
        }
      });
    };
    
    cleanupAllHighlights();
  }, [currentStepData?.stepNumber, isActive]);

  // Highlight target element
  useEffect(() => {
    if (!targetElement || !isActive) {
      return;
    }

    // Pentru step-ul 8, highlight pe toate cele 3 butoane
    if (currentStepData?.stepNumber === 8 && currentStepData?.highlightMultiple) {
      const buttons = [
        document.querySelector('s-button[data-onboarding="add-metafields"]'),
        document.querySelector('s-button[data-onboarding="add-product-spec"]'),
        document.querySelector('s-button[data-onboarding="add-custom-spec"]')
      ].filter(Boolean);


      const highlightButton = (button) => {
        const shadowRoot = button.shadowRoot;
        const buttonInShadow = shadowRoot?.querySelector('button');
        const buttonInElement = button.querySelector('button');
        const buttonFound = buttonInShadow || buttonInElement;

        if (buttonFound) {
          buttonFound.style.outline = "3px solid #FFCC00";
          buttonFound.style.outlineOffset = "2px";
          buttonFound.style.borderRadius = "4px";
          buttonFound.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5)";
          buttonFound.style.zIndex = "9997";
          buttonFound.style.position = "relative";
        } else {
          // Fallback: wrapper în jurul s-button
          const wrapper = document.createElement('div');
          wrapper.style.cssText = `
            position: relative;
            display: inline-block;
            padding: 4px;
            border: 3px solid #FFCC00 !important;
            border-radius: 6px !important;
            box-shadow: 0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5) !important;
            z-index: 9997;
            box-sizing: border-box;
          `;
          wrapper.setAttribute('data-onboarding-wrapper', 'true');
          
          if (button.parentNode) {
            button.parentNode.insertBefore(wrapper, button);
            wrapper.appendChild(button);
            button._onboardingWrapper = wrapper;
          }
        }
      };

      buttons.forEach(highlightButton);

      // Cleanup
      return () => {
        buttons.forEach(button => {
          const shadowRoot = button.shadowRoot;
          const buttonInShadow = shadowRoot?.querySelector('button');
          const buttonInElement = button.querySelector('button');
          const buttonFound = buttonInShadow || buttonInElement;

          if (buttonFound) {
            buttonFound.style.outline = "";
            buttonFound.style.outlineOffset = "";
            buttonFound.style.borderRadius = "";
            buttonFound.style.boxShadow = "";
            buttonFound.style.zIndex = "";
            buttonFound.style.position = "";
          }

          if (button._onboardingWrapper) {
            const wrapper = button._onboardingWrapper;
            if (wrapper.parentNode && button.parentNode === wrapper) {
              wrapper.parentNode.insertBefore(button, wrapper);
              wrapper.remove();
              delete button._onboardingWrapper;
            }
          }
        });
      };
    }

    // Găsește elementul real pentru highlight
    let actualElement = targetElement;
    let highlightWrapper = null;
    
    // Pentru s-button, caută button-ul din interior (shadow DOM sau direct)
    if (targetElement.tagName === 'S-BUTTON') {
      // Încearcă să găsească button-ul în shadow root sau direct în element
      const shadowRoot = targetElement.shadowRoot;
      const buttonInShadow = shadowRoot?.querySelector('button');
      const buttonInElement = targetElement.querySelector('button');
      const buttonFound = buttonInShadow || buttonInElement;
      
      if (buttonFound) {
        actualElement = buttonFound;
      } else {
        // Dacă nu găsește button-ul, creează un wrapper în jurul s-button
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          position: relative;
          display: inline-block;
          padding: 4px;
          border: 3px solid #FFCC00 !important;
          border-radius: 6px !important;
          box-shadow: 0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5) !important;
          z-index: 9997;
          box-sizing: border-box;
        `;
        wrapper.setAttribute('data-onboarding-wrapper', 'true');
        
        if (targetElement.parentNode) {
          targetElement.parentNode.insertBefore(wrapper, targetElement);
          wrapper.appendChild(targetElement);
          highlightWrapper = wrapper;
          actualElement = wrapper;
          targetElement._onboardingWrapper = wrapper;
        } else {
          actualElement = targetElement;
        }
      }
    } else if (targetElement.tagName === 'S-TEXT-FIELD') {
      // Creează un wrapper div în jurul s-text-field pentru highlight
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        position: relative;
        display: inline-block;
        width: 100%;
        padding: 4px;
        border: 3px solid #FFCC00 !important;
        border-radius: 6px !important;
        box-shadow: 0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5) !important;
        z-index: 9997;
        box-sizing: border-box;
      `;
      wrapper.setAttribute('data-onboarding-wrapper', 'true');
      
      // Înlocuiește s-text-field cu wrapper și pune s-text-field în interior
      if (targetElement.parentNode) {
        targetElement.parentNode.insertBefore(wrapper, targetElement);
        wrapper.appendChild(targetElement);
        highlightWrapper = wrapper;
        actualElement = wrapper;
        // Păstrează referința pentru cleanup
        targetElement._onboardingWrapper = wrapper;
      } else {
        actualElement = targetElement;
      }
    } else if (targetElement.closest('s-text-field')) {
      const textField = targetElement.closest('s-text-field');
      // Creează wrapper pentru s-text-field găsit
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        position: relative;
        display: inline-block;
        width: 100%;
        padding: 4px;
        border: 3px solid #FFCC00 !important;
        border-radius: 6px !important;
        box-shadow: 0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5) !important;
        z-index: 9997;
        box-sizing: border-box;
      `;
      wrapper.setAttribute('data-onboarding-wrapper', 'true');
      
      if (textField.parentNode) {
        textField.parentNode.insertBefore(wrapper, textField);
        wrapper.appendChild(textField);
        highlightWrapper = wrapper;
        actualElement = wrapper;
        textField._onboardingWrapper = wrapper;
      } else {
        actualElement = textField;
      }
    } else if (targetElement.tagName === 'TD') {
      // Pentru td, aplică highlight direct
      actualElement = targetElement;
    } else if (targetElement.tagName === 'DIV') {
      // Pentru div, aplică highlight direct
      actualElement = targetElement;
    } else if (targetElement.tagName === 'S-SWITCH') {
      // Pentru s-switch, aplică highlight direct
      actualElement = targetElement;
    } else if (targetElement.tagName === 'INPUT') {
      actualElement = targetElement;
    } else if (targetElement.tagName === 'S-TEXT') {
      actualElement = targetElement;
    } else if (targetElement.tagName === 'SECTION') {
      // Pentru section HTML native, aplică highlight direct
      actualElement = targetElement;
    } else if (targetElement.tagName === 'S-SECTION') {
      // Pentru s-section, aplică highlight direct
      actualElement = targetElement;
    } else if (targetElement.tagName === 'S-STACK') {
      // Pentru s-stack, aplică highlight direct
      actualElement = targetElement;
    } else if (targetElement.tagName === 'SPAN' && targetElement.classList.contains('stack')) {
      // Pentru span.stack, aplică highlight direct
      actualElement = targetElement;
    } else if (targetElement.tagName === 'LABEL') {
      // Pentru label HTML native, aplică highlight direct
      actualElement = targetElement;
    } else {
      // Încearcă să găsească un input în interior
      const inputElement = targetElement.querySelector('input');
      if (inputElement) {
        actualElement = inputElement;
      } else {
        actualElement = targetElement;
      }
    }

    if (!actualElement) return;

    // Store original styles
    const originalStyles = {
      position: actualElement.style.position || "",
      zIndex: actualElement.style.zIndex || "",
      outline: actualElement.style.outline || "",
      outlineOffset: actualElement.style.outlineOffset || "",
      borderRadius: actualElement.style.borderRadius || "",
      boxShadow: actualElement.style.boxShadow || "",
      border: actualElement.style.border || "",
      display: actualElement.style.display || "",
      padding: actualElement.style.padding || "",
    };

    // Salvează stilurile originale pe element pentru cleanup
    actualElement._onboardingOriginalStyles = originalStyles;
    actualElement._onboardingHighlighted = true;

    // Aplică stiluri de bază
    actualElement.style.position = "relative";
    actualElement.style.zIndex = highlightWrapper ? "9997" : "9997"; // Mai mic decât tooltip (9999)

    // Pentru elemente s-text, adaugă padding pentru a face outline-ul mai vizibil
    if (actualElement.tagName === 'S-TEXT') {
      actualElement.style.display = "inline-block";
      actualElement.style.padding = "4px 8px";
      actualElement.style.outline = "3px solid #FFCC00";
      actualElement.style.outlineOffset = "2px";
      actualElement.style.borderRadius = "4px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3)";
    } else if (actualElement.tagName === 'TD') {
      // Pentru td, aplică highlight cu border
      actualElement.style.border = "3px solid #FFCC00";
      actualElement.style.borderRadius = "4px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5)";
    } else if (actualElement.tagName === 'DIV') {
      // Pentru div, aplică highlight cu border
      actualElement.style.border = "3px solid #FFCC00";
      actualElement.style.borderRadius = "8px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5)";
      actualElement.style.padding = "8px";
    } else if (actualElement.tagName === 'S-SWITCH') {
      // Pentru s-switch, aplică highlight cu border
      actualElement.style.border = "3px solid #FFCC00";
      actualElement.style.borderRadius = "6px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5)";
      actualElement.style.padding = "8px";
    } else if (actualElement.tagName === 'S-SECTION') {
      // Pentru s-section, aplică highlight cu border
      actualElement.style.border = "3px solid #FFCC00";
      actualElement.style.borderRadius = "8px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5)";
      actualElement.style.padding = "8px";
    } else if (actualElement.tagName === 'SECTION') {
      // Pentru section HTML native, aplică highlight cu border
      actualElement.style.border = "3px solid #FFCC00";
      actualElement.style.borderRadius = "8px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5)";
      actualElement.style.padding = "8px";
    } else if (actualElement.tagName === 'S-STACK') {
      // Pentru s-stack, aplică highlight cu border
      actualElement.style.border = "3px solid #FFCC00";
      actualElement.style.borderRadius = "8px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5)";
      actualElement.style.padding = "8px";
    } else if (actualElement.tagName === 'SPAN' && actualElement.classList.contains('stack')) {
      // Pentru span.stack, aplică highlight cu border
      actualElement.style.border = "3px solid #FFCC00";
      actualElement.style.borderRadius = "8px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5)";
      actualElement.style.padding = "8px";
    } else if (actualElement.tagName === 'LABEL') {
      // Pentru label HTML native, aplică highlight cu border
      actualElement.style.border = "3px solid #FFCC00";
      actualElement.style.borderRadius = "6px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3), 0 0 10px rgba(255, 204, 0, 0.5)";
      actualElement.style.padding = "8px";
    } else if (highlightWrapper) {
      // Highlight-ul este deja aplicat pe wrapper-ul creat pentru s-text-field
      // Nu trebuie să aplicăm stiluri suplimentare
    } else {
      // Pentru input-uri normale
      actualElement.style.outline = "3px solid #FFCC00";
      actualElement.style.outlineOffset = "2px";
      actualElement.style.borderRadius = "4px";
      actualElement.style.boxShadow = "0 0 0 3px rgba(255, 204, 0, 0.3)";
    }

    // Cleanup
    return () => {
      if (actualElement && actualElement._onboardingHighlighted) {
        // Restaurează stilurile originale
        if (actualElement._onboardingOriginalStyles) {
          Object.keys(actualElement._onboardingOriginalStyles).forEach(prop => {
            actualElement.style[prop] = actualElement._onboardingOriginalStyles[prop];
          });
          delete actualElement._onboardingOriginalStyles;
        } else {
          // Fallback: restaurează manual dacă nu avem stiluri salvate
          actualElement.style.position = originalStyles.position;
          actualElement.style.zIndex = originalStyles.zIndex;
          actualElement.style.outline = originalStyles.outline;
          actualElement.style.outlineOffset = originalStyles.outlineOffset;
          actualElement.style.borderRadius = originalStyles.borderRadius;
          actualElement.style.boxShadow = originalStyles.boxShadow;
          actualElement.style.border = originalStyles.border;
          
          // Pentru s-text, restaurează și display și padding
          if (actualElement.tagName === 'S-TEXT') {
            actualElement.style.display = originalStyles.display;
            actualElement.style.padding = originalStyles.padding;
          }
          
          // Pentru td, div, s-switch, s-section, s-stack, span.stack, section și label, restaurează padding
          if (actualElement.tagName === 'TD' || actualElement.tagName === 'DIV' || actualElement.tagName === 'S-SWITCH' || actualElement.tagName === 'S-SECTION' || actualElement.tagName === 'S-STACK' || actualElement.tagName === 'SECTION' || actualElement.tagName === 'LABEL' || (actualElement.tagName === 'SPAN' && actualElement.classList.contains('stack'))) {
            actualElement.style.padding = originalStyles.padding;
          }
        }
        delete actualElement._onboardingHighlighted;
      }
    };
  }, [targetElement, isActive, currentStepData]);

  if (!isActive || !currentStepData) {
    return null;
  }

  const handleNext = () => {
    if (currentStepData.onNext) {
      currentStepData.onNext();
    }
    nextStep();
  };

  const handlePrevious = () => {
    previousStep();
  };

  return (
    <>
      {/* Overlay backdrop - complet transparent, doar pentru z-index */}
      <div
        ref={overlayRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "transparent",
          zIndex: 9998,
          pointerEvents: "none", // Permite click-uri pe elementele din pagină
        }}
      />

      {/* Tooltip - poziționat în partea de jos */}
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          maxWidth: isCollapsed ? "600px" : (currentStepData?.wideTooltip ? "1000px" : "700px"),
          minWidth: isCollapsed ? "400px" : (currentStepData?.wideTooltip ? "700px" : "500px"),
          width: "90%",
        }}
      >
        {isCollapsed ? (
          // Bară minimizată
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "8px",
              padding: "12px 16px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#6D7175",
                  whiteSpace: "nowrap",
                }}
              >
                Step {currentStepData.stepNumber} of {steps.length}
              </div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#202223",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
                title={currentStepData.title}
              >
                {currentStepData.title}
              </div>
            </div>
            <div
              onClick={() => setIsCollapsed(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsCollapsed(false);
                }
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 8px",
                color: "#6D7175",
                fontSize: "14px",
                lineHeight: "1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "color 0.2s, background-color 0.2s",
                borderRadius: "4px",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#202223";
                e.currentTarget.style.backgroundColor = "#f6f6f7";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#6D7175";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
              aria-label="Expand guide"
              title="Expand guide"
            >
              <span style={{ fontSize: "18px" }}>▴</span>
              <span>Expand the guide</span>
            </div>
          </div>
        ) : (
          // Tooltip complet
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "16px",
              }}
            >
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#202223",
                    lineHeight: "24px",
                  }}
                >
                  {currentStepData.title}
                </h3>
                {currentStepData.stepNumber && (
                  <p
                    style={{
                      margin: "4px 0 0 0",
                      fontSize: "14px",
                      color: "#6D7175",
                    }}
                  >
                    Step {currentStepData.stepNumber} of {steps.length}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {/* Video tutorial button (for steps >= 3) */}
                {currentStepData.stepNumber >= 3 && (
                  <div
                    onClick={() => {
                      window.open("https://youtu.be/SsFsk70_NlQ", "_blank", "noopener,noreferrer");
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        window.open("https://youtu.be/SsFsk70_NlQ", "_blank", "noopener,noreferrer");
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      backgroundColor: "#FF0000",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: "600",
                      transition: "background-color 0.2s, transform 0.1s",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#CC0000";
                      e.currentTarget.style.transform = "scale(1.02)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#FF0000";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                    aria-label="Watch video tutorial on YouTube"
                    title="Watch video tutorial on YouTube"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      style={{ flexShrink: 0 }}
                    >
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    <span>Video tutorial</span>
                  </div>
                )}
                <div
                  onClick={() => setIsCollapsed(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setIsCollapsed(true);
                    }
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 8px",
                    color: "#6D7175",
                    fontSize: "14px",
                    lineHeight: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "color 0.2s, background-color 0.2s",
                    borderRadius: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#202223";
                    e.currentTarget.style.backgroundColor = "#f6f6f7";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#6D7175";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  aria-label="Minimize guide"
                  title="Minimize guide"
                >
                  <span style={{ fontSize: "20px" }}>▾</span>
                  <span>Minimize</span>
                </div>
              </div>
            </div>

            {/* Content */}
            <div
              style={{
                marginBottom: "20px",
                fontSize: "14px",
                color: "#202223",
                lineHeight: "20px",
              }}
            >
              {typeof currentStepData.content === "string" ? (
                <p style={{ margin: 0 }}>{currentStepData.content}</p>
              ) : (
                currentStepData.content
              )}
            </div>

            {/* Info box (optional) */}
            {currentStepData.info && (
              <div
                style={{
                  backgroundColor: "#F0F4FF",
                  borderRadius: "8px",
                  padding: "16px",
                  marginBottom: "20px",
                  fontSize: "14px",
                  color: "#202223",
                  lineHeight: "20px",
                  border: "1px solid #B4C6FF",
                }}
              >
                {typeof currentStepData.info === "string" ? (
                  <div style={{ whiteSpace: "pre-line" }}>{currentStepData.info}</div>
                ) : (
                  currentStepData.info
                )}
              </div>
            )}

            {/* Progress bar */}
            <div
              style={{
                height: "4px",
                backgroundColor: "#E1E3E5",
                borderRadius: "2px",
                marginBottom: "20px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  backgroundColor: "#f7a205",
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <button
                onClick={() => {
                  skipTour();
                  // Asigură-te că overlay-ul dispare complet
                  if (overlayRef.current) {
                    overlayRef.current.style.display = "none";
                  }
                  if (tooltipRef.current) {
                    tooltipRef.current.style.display = "none";
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 16px",
                  fontSize: "14px",
                  color: "#6D7175",
                  fontWeight: "500",
                }}
              >
                Skip tour
              </button>
              <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                {hasPrevious && (
                  <button
                    onClick={handlePrevious}
                    style={{
                      background: "#F6F6F7",
                      border: "1px solid #D1D5DB",
                      borderRadius: "6px",
                      cursor: "pointer",
                      padding: "8px 16px",
                      fontSize: "14px",
                      color: "#202223",
                      fontWeight: "500",
                    }}
                  >
                    Previous
                  </button>
                )}
                <button
                  onClick={handleNext}
                  style={{
                    background: "#f7a205",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    padding: "8px 24px",
                    fontSize: "14px",
                    color: "#ffffff",
                    fontWeight: "600",
                  }}
                >
                  {hasNext ? "Next" : "Finish"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
