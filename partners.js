// partners.js - Sponsorship Request Page
(function() {
    'use strict';

    function setupSponsorPage() {
        // 1. Clear the entire page content
        document.body.innerHTML = '';

        // 2. Set page styling for a clean, centered look
        document.documentElement.style.height = '100%';
        document.body.style.cssText = `
            margin: 0;
            padding: 20px;
            height: 95vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            user-select: none;
            text-align: center;
        `;

        // 3. Create the text element
        const message = document.createElement('h2');
        message.style.cssText = `
            font-weight: 500;
            margin-bottom: 25px;
            font-size: clamp(1.2rem, 5vw, 1.8rem);
        `;
        message.textContent = "We don't have any paid sponsors at the moment";

        // 4. Create the "Apply for sponsor" button
        const sponsorBtn = document.createElement('a');

        // Email configuration
        const email = "teamheartquote@gmail.com";
        const subject = encodeURIComponent("Request to become a sponsor");
        sponsorBtn.href = `mailto:${email}?subject=${subject}`;

        sponsorBtn.style.cssText = `
            background-color: #007bff;
            color: white;
            padding: 14px 28px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
        `;
        sponsorBtn.textContent = 'Apply for sponsor';

        // Hover effects
        sponsorBtn.onmouseover = () => {
            sponsorBtn.style.backgroundColor = '#0056b3';
            sponsorBtn.style.transform = 'scale(1.05)';
        };
        sponsorBtn.onmouseout = () => {
            sponsorBtn.style.backgroundColor = '#007bff';
            sponsorBtn.style.transform = 'scale(1)';
        };

        // 5. Append elements to the body
        document.body.appendChild(message);
        document.body.appendChild(sponsorBtn);

        console.log('✅ Sponsor page initialized');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupSponsorPage);
    } else {
        setupSponsorPage();
    }

})();