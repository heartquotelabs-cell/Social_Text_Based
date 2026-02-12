document.addEventListener('DOMContentLoaded', function() {
  const promotion = document.getElementById('promotion');
  // Create main container
  const notesKeeper = document.createElement('div');
  notesKeeper.id = 'notes-keeper';
  notesKeeper.style.cssText = `
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 15px;
    border: .5px solid #e0e0e0;
    border-radius: 15px;
    margin: 10px;
    max-width: 600px;
    font-family: Arial, sans-serif;
  `;

  // Image container (45x45px)
  const imgContainer = document.createElement('div');
  imgContainer.style.cssText = `
    width: 45px;
    height: 45px;
    flex-shrink: 0;
    border-radius: 4px;
    overflow: hidden;
  `;
  
  const img = document.createElement('img');
  img.src = 'logo.png'; // Replace with your image URL
  img.alt = 'logo';
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
  `;
  imgContainer.appendChild(img);

  // Content container
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `;

  // Image name
  const nameElement = document.createElement('div');
  nameElement.style.cssText = `
    font-weight: bold;
    font-size: 16px;
    text-align: left;
  `;
  nameElement.textContent = 'Notes Keeper';

  // Small title showcase (at bottom of name)
  const showcaseTitle = document.createElement('div');
  showcaseTitle.style.cssText = `
    font-size: 12px;
    color: #666;
    font-style: italic;
    text-align: left;
  `;
  showcaseTitle.textContent = 'Your notes organizer';

  // Right side red button
// Right side red button - with style reset
const button = document.createElement('button');
button.textContent = 'Get App';

// Reset ALL inherited styles first
button.style.cssText = `
  all: initial !important;
  display: inline-block !important;
  background-color: #ff4444 !important;
  color: white !important;
  border: none !important;
  border-radius: 4px !important;
  padding: 8px 16px !important;
  font-size: 14px !important;
  font-family: Arial, sans-serif !important;
  cursor: pointer !important;
  font-weight: 500 !important;
  transition: background-color 0.2s !important;
  flex-shrink: 0 !important;
  width: auto !important;
  height: auto !important;
  margin: 0 !important;
  line-height: normal !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  box-shadow: none !important;
  text-shadow: none !important;
`;

// Hover effect
button.addEventListener('mouseenter', () => {
  button.style.backgroundColor = '#cc0000 !important';
});

button.addEventListener('mouseleave', () => {
  button.style.backgroundColor = '#ff4444 !important';
});

  // Click handler - open provided link
  button.addEventListener('click', function() {
    const link = 'https://apkpure.com/heartquote/com.heartquote/downloading'; // Replace with your actual link
    window.open(link, '_blank');
  });

  // Assemble structure
  contentContainer.appendChild(nameElement);
  contentContainer.appendChild(showcaseTitle);
  
  notesKeeper.appendChild(imgContainer);
  notesKeeper.appendChild(contentContainer);
  notesKeeper.appendChild(button);

  // Add to page
  promotion.appendChild(notesKeeper);
});