// Smooth animation for details elements
document.addEventListener('DOMContentLoaded', function() {
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
  
  details.forEach(detail => {
    const summary = detail.querySelector('summary');
    
    summary.addEventListener('click', (e) => {
      e.preventDefault();
      
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
    });
  });
});