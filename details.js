// Smooth animation for details elements
document.addEventListener('DOMContentLoaded', function() {
  // Build the contact address only when someone acts on the link, so it is never in the
  // served HTML or the rendered DOM; the LinkedIn href stays as the fallback until then.
  const contact = document.getElementById('contact');
  if (contact) {
    const arm = function () {
      const p = ['nehpets', 'otano', 'moc'].map(s => s.split('').reverse().join(''));
      contact.href = 'mailto:' + p[0] + '@' + p[1] + '.' + p[2];
    };
    ['mousedown', 'touchstart', 'focus'].forEach(ev => contact.addEventListener(ev, arm, { passive: true }));
  }

  const details = document.querySelectorAll('details');
  
  // Initialize all detail contents to prevent first-time jerkiness
  details.forEach(detail => {
    const content = detail.querySelector('.detail-content');
    if (!detail.open) {
      content.style.maxHeight = '0';
      content.style.opacity = '0';
      content.style.padding = '0 30px';
      content.style.margin = '0';
    }
  });
  
  function closeDetail(detail) {
    const content = detail.querySelector('.detail-content');
    // Set current height explicitly to enable smooth transition
    content.style.maxHeight = content.scrollHeight + 'px';
    
    // Trigger reflow to ensure the height is set
    void content.offsetHeight;
    
    // Now animate to closed state
    requestAnimationFrame(() => {
      content.style.maxHeight = '0';
      content.style.opacity = '0';
      content.style.padding = '0 30px';
      content.style.margin = '0';
    });
    
    setTimeout(() => {
      detail.open = false;
    }, 300);
  }
  
  function openDetail(detail) {
    const content = detail.querySelector('.detail-content');
    detail.open = true;
    
    // Start from closed state
    content.style.maxHeight = '0';
    content.style.opacity = '0';
    content.style.padding = '0 30px';
    content.style.margin = '0';
    
    // Trigger reflow
    void content.offsetHeight;
    
    // Animate to open state
    requestAnimationFrame(() => {
      content.style.maxHeight = (content.scrollHeight + 50) + 'px';
      content.style.opacity = '1';
      content.style.padding = '10px 30px';
      content.style.margin = '5px 0';
    });
  }
  
  // Function to handle opening/closing details
  function toggleDetail(detail) {
    if (detail.open) {
      // Just close this one
      closeDetail(detail);
    } else {
      // Close all other open details first
      let hasOpenDetails = false;
      details.forEach(otherDetail => {
        if (otherDetail !== detail && otherDetail.open) {
          closeDetail(otherDetail);
          hasOpenDetails = true;
        }
      });
      
      // Then open this one with a slight delay if others were closing
      if (hasOpenDetails) {
        setTimeout(() => openDetail(detail), 150);
      } else {
        openDetail(detail);
      }
    }
  }
  
  details.forEach(detail => {
    const summary = detail.querySelector('summary');
    
    // Make summaries focusable
    summary.setAttribute('tabindex', '0');

    // Let CSS reserve the hover weight's width (see summary::after)
    summary.dataset.text = summary.textContent.trim();
    
    // Handle click on summary
    summary.addEventListener('click', (e) => {
      e.preventDefault();
      toggleDetail(detail);
    });
    
    // Stop propagation when clicking inside detail content
    const content = detail.querySelector('.detail-content');
    content.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Handle keyboard navigation
    summary.addEventListener('keydown', (e) => {
      // Enter or Space to toggle
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDetail(detail);
      }
      // Escape to close if open
      else if (e.key === 'Escape' && detail.open) {
        e.preventDefault();
        closeDetail(detail);
      }
    });
  });
  
  // Also make bottom links keyboard accessible
  const bottomLinks = document.querySelectorAll('.bottom-links a');
  bottomLinks.forEach(link => {
    // Links are already focusable by default, but ensure they have good focus styles
    link.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        // Allow default behavior for links
      }
    });
  });
  
  // Close details when clicking outside
  document.addEventListener('click', (e) => {
    // If click is not on a details element or its children
    if (!e.target.closest('details.stack-item')) {
      details.forEach(detail => {
        if (detail.open) {
          closeDetail(detail);
        }
      });
    }
  });
});