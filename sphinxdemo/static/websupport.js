(function($) {
  var commentListEmpty, replyTemplate, commentTemplate, popup, comp;

  function init() {
    initTemplates();
    initEvents();
    initComparator();
  };

  function initEvents() {
    $('a#comment_close').click(function(event) {
      event.preventDefault();
      hide();
    });
    $('form#comment_form').submit(function(event) {
      event.preventDefault();
      addComment($('form#comment_form'));
    });
    $('.vote').live("click", function() {
      handleVote($(this));
      return false;
    });
    $('a.reply').live("click", function() {
      openReply($(this).attr('id').substring(2));
      return false;
    });
    $('a.close_reply').live("click", function() {
      closeReply($(this).attr('id').substring(2));
      return false;
    });
    $('a.sort_option').click(function(event) {
      event.preventDefault();
      handleReSort($(this));
    });
  };

  function initTemplates() {
    // Preload the replyTemplate and commentTemplate.
    replyTemplate = $('#reply_template').html();
    commentTemplate = $('#comment_template').html();
    // Create our popup div, the same div is recycled each time comments
    // are displayed.
    var popupTemplate = $('#popup_template').html();
    var popup = $(renderTemplate(popupTemplate, opts));
    $('body').append(popup);
  };

  /**
   * Create a comp function. If the user has preferences stored in
   * the sortBy cookie, use those, otherwise use the default.
   */
  function initComparator() {
    var by = 'rating'; // Default to sort by rating.
    // If the sortBy cookie is set, use that instead.
    if (document.cookie.length > 0) {
      var start = document.cookie.indexOf('sortBy=');
      if (start != -1) {
	start = start + 7;
	var end = document.cookie.indexOf(";", start);
	if (end == -1)
	  end = document.cookie.length;
	by = unescape(document.cookie.substring(start, end));
      }
    }
    setComparator(by);
  };

  /**
   * Show the comments popup window.
   */
  function show(nodeId) {
    var id = nodeId.substring(1);

    // Reset the main comment form, and set the value of the parent input.
    $('form#comment_form')
      .find('textarea,input')
	.removeAttr('disabled').end()
      .find('input[name="parent"]')
	.val('s' + id);

    // Position the popup and show it.
    var clientWidth = document.documentElement.clientWidth;
    var popupWidth = $('div.popup_comment').width();
    $('div#focuser').show();
    $('div.popup_comment')
      .css({
	'top': 100+$(window).scrollTop(),
	'left': clientWidth/2-popupWidth/2,
	'position': 'absolute'
      })
      .show();

    getComments(id);
  };

  /**
   * Hide the comments popup window.
   */
  function hide() {
    $('div#focuser').hide();
    $('div.popup_comment').hide();
    $('ul#comment_ul').empty();
    $('h3#comment_notification').show();
    $('form#comment_form').reset();
  };

  /**
   * Perform an ajax request to get comments for a node
   * and insert the comments into the comments tree.
   */
  function getComments(id) {
    $.ajax({
      type: 'GET',
      url: opts.getCommentsURL,
      data: {parent: 's' + id},
      success: function(data, textStatus, request) {
	if (data.comments.length == 0) {
	  $('ul#comment_ul').html('<li>No comments yet.</li>');
	  commentListEmpty = true;
	}
	else {
	  // If there are comments, sort them and put them in the list.
	  comments = sortComments(data.comments);
	  appendComments(data.comments);
	  commentListEmpty = false;
	}
	$('h3#comment_notification').hide()
      },
      error: function(request, textStatus, error) {
	alert('error');
      },
      dataType: 'json'
    });
  };

  /**
   * Add a comment via ajax and insert the comment into the comment tree.
   */
  function addComment(form) {
    // Disable the form that is being submitted.
    form.find('textarea,input').attr('disabled', 'disabled');

    // Send the comment to the server.
    $.ajax({
      type: "POST",
      url: opts.addCommentURL,
      dataType: 'json',
      data: {parent: form.find('input[name="parent"]').val(),
	     text: form.find(' textarea[name="comment"]').val()},
      success: function(data, textStatus, error) {
	// Reset the form.
	form.find('textarea')
	  .val('')
	    .add(form.find('input'))
	      .removeAttr('disabled');
	if (commentListEmpty) {
	  $('ul#comment_ul').empty();
	  commentListEmpty = false;
	}
	insertComment(data.comment);
      },
      error: function(request, textStatus, error) {
	form.find('textarea,input').removeAttr('disabled');
	alert(error);
      }
    });
  };

  /**
   * Recursively append comments to the main comment list and children
   * lists, creating the comment tree.
   */
  function appendComments(comments, ul) {
    if (ul == null)
      ul = $('ul#comment_ul');
    $.each(comments, function() {
      var div = createCommentDiv(this);
      ul.append($('<li></li>').html(div));
      appendComments(this.children, div.find('ul.children'));
      // To avoid stagnating data, don't store the comments children in data.
      this.children = null;
      div.data('comment', this);
    });
  };

  /**
   * After adding a new comment, it must be inserted in the correct
   * location in the comment tree.
   */
  function insertComment(comment) {
    var div = createCommentDiv(comment);

    // To avoid stagnating data, don't store the comments children in data.
    comment.children = null;
    div.data('comment', comment);

    if (comment.node != null) {
      var ul = $('ul#comment_ul');
      var siblings = getChildren(ul);
    }
    else {
      var ul = $('#cl' + comment.parent);
      var siblings = getChildren(ul);
    }

    // Determine where in the parents children list to insert this comment.
    for(i=0; i < siblings.length; i++) {
      if (comp(comment, siblings[i]) <= 0) {
	$('#cd' + siblings[i].id)
	  .parent()
	    .before($('<li></li>')
	      .html(div));
	return;
      }
    }
    // If we get here, this comment rates lower than all the others,
    // or it is the only comment in the list.
    ul.append($('<li></li>').html(div));
  };

  /**
   * Handle when the user clicks on a sort by link.
   */
  function handleReSort(link) {
    setComparator(link.attr('id'));
     // Save/update the sortBy cookie.
    var expiration = new Date();
    expiration.setDate(expiration.getDate() + 365);
    document.cookie= 'sortBy=' + escape(link.attr('id')) +
      ';expires=' + expiration.toUTCString();
    comments = getChildren($('ul#comment_ul'), true);
    comments = sortComments(comments);
    $('ul#comment_ul').empty();

    appendComments(comments);
  };

  /**
   * Function to process a vote when a user clicks an arrow.
   */
  function handleVote(link) {
    if (!opts.voting) {
      showError("You'll need to login to vote.");
      return;
    }

    var id = link.attr('id');
    // If it is an unvote, the new vote value is 0,
    // Otherwise it's 1 for an upvote, or -1 for a downvote.
    if (id.charAt(1) == 'u')
      var value = 0;
    else
      var value = id.charAt(0) == 'u' ? 1 : -1;

    // The data to be sent to the server.
    var d = {
      comment_id: id.substring(2),
      value: value
    };

    // Swap the vote and unvote links.
    link.hide();
    $('#' + id.charAt(0) + (id.charAt(1) == 'u' ? 'v' : 'u') + d.comment_id)
      .show();

    // The div the comment is displayed in.
    var div = $('div#cd' + d.comment_id);
    var data = div.data('comment');

    // If this is not an unvote, and the other vote arrow has
    // already been pressed, unpress it.
    if ((d.value != 0) && (data.vote == d.value*-1)) {
      $('#' + (d.value == 1 ? 'd' : 'u') + 'u' + d.comment_id)
	.hide();
      $('#' + (d.value == 1 ? 'd' : 'u') + 'v' + d.comment_id)
	.show();
    }

    // Update the comments rating in the local data.
    data.rating += (data.vote == 0) ? d.value : (d.value - data.vote);
    data.vote = d.value;
    div.data('comment', data);

    // Change the rating text.
    div.find('.rating:first')
      .text(data.rating + ' point' + (data.rating == 1 ? '' : 's'));

    // Send the vote information to the server.
    $.ajax({
      type: "POST",
      url: opts.processVoteURL,
      data: d,
      error: function(request, textStatus, error) {
	alert(textStatus);
      }
    });
  };

  /**
   * Open a reply form used to reply to an existing comment.
   */
  function openReply(id) {
    // Swap out the reply link for the hide link
    $('#rl' + id).hide();
    $('#cr' + id).show();

    // Add the reply li to the children ul.
    $('#cl' + id)
      .prepend(renderTemplate(replyTemplate, {id: id}))
      // Setup the submit handler for the reply form.
      .find('#rf' + id)
	.submit(function(event) {
	  event.preventDefault();
	  addComment($('#rf' + id));
	  closeReply(id);
	});
  };

  /**
   * Close the reply form opened with openReply.
   */
  function closeReply(id) {
    // Remove the reply div from the DOM.
    $('#rd' + id).remove();
    // Swap out the hide link for the reply link
    $('#cr' + id).hide();
    $('#rl' + id).show();
  };

  /**
   * Recursively sort a tree of comments using the comp comparator.
   */
  function sortComments(comments) {
    comments.sort(comp);
    $.each(comments, function() {
      this.children = sortComments(this.children);
    });
    return comments;
  };

  /**
   * Set comp, which is a comparator function used for sorting and
   * inserting comments into the list.
   */
  function setComparator(by) {
    // If the first three letters are "asc", sort in ascending order
    // and remove the prefix.
    if (by.substring(0,3) == 'asc') {
      var i = by.substring(3);
      comp = function(a, b) { return a[i] - b[i]; }
    }
    // Otherwise sort in descending order.
    else
      comp = function(a, b) { return b[by] - a[by]; }

    // Reset link styles and format the selected sort option.
    $('a.sel').attr('href', '#').removeClass('sel');
    $('#' + by).removeAttr('href').addClass('sel');
  };

  /**
   * Get the children comments from a ul. If recursive is true,
   * recursively include childrens' children.
   */
  function getChildren(ul, recursive) {
    var children = [];
    ul.children().children()
      .each(function() {
	var comment = $(this).data('comment');
	if (recursive) {
	  comment.children =
	    getChildren($(this).find('#cl' + comment.id), true);
	}
	children.push(comment);
      });
    return children;
  };

  /**
   * Create a div to display a comment in.
   */
  function createCommentDiv(comment) {
    // Prettify the comment rating.
    comment.pretty_rating = comment.rating + ' point' +
      (comment.rating == 1 ? '' : 's');
    // Create a div for this comment.
    var context = $.extend({}, comment, opts);
    var div = $(renderTemplate(commentTemplate, context));

    // If the user has voted on this comment, highlight the correct arrow.
    if (comment.vote) {
      var dir = (comment.vote == 1) ? 'u' : 'd';
      div.find('#' + dir + 'v' + comment.id).hide();
      div.find('#' + dir + 'u' + comment.id).show();
    }
    return div;
  }

  /**
   * A simple template renderer. Placeholders such as <%id%> are replaced
   * by context['id']. Items are always escaped.
   */
  function renderTemplate(template, context) {
    var esc = $('<span></span>');

    function handle(ph) {
      var cur = context;
      $.each(ph.split('.'), function() {
	cur = cur[this];
      });
      return esc.text(cur || "").html();
    }

    return template.replace(/<%([\w\.]*)%>/g, function(){
      return handle(arguments[1]);
    });
  };

  function showError(message) {
    $('<div class="popup_error">' +
      '<h1>You\'ll need to login to vote</h1>' +
      '</div>')
	.appendTo('body')
	  .fadeIn("slow")
	    .delay(2000)
	      .fadeOut("slow");
  };

  /**
   * Add a link the user uses to open the comments popup.
   */
  $.fn.comment = function() {
    return this.each(function() {
      $(this).append(
	$('<a href="#" class="sphinx_comment"></a>')
	  .html(opts.commentHTML)
	  .click(function(event) {
	    event.preventDefault();
	    show($(this).parent().attr('id'));
	  }));
    });
  };

  var opts = jQuery.extend({
    processVoteURL: '/process_vote',
    addCommentURL: '/add_comment',
    getCommentsURL: '/get_comments',
    commentHTML: '<img src="/static/comment.png" alt="comment" />',
    upArrow: '/static/up.png',
    downArrow: '/static/down.png',
    upArrowPressed: '/static/up-pressed.png',
    downArrowPressed: '/static/down-pressed.png',
    voting: false
  }, COMMENT_OPTIONS);

  $(document).ready(function() {
    init();
  });
})(jQuery);

$(document).ready(function() {
  $('.spxcmt').comment();

  /** Highlight search words in search results. */
  $("div.context").each(function() {
    var params = $.getQueryParameters();
    var terms = (params.q) ? params.q[0].split(/\s+/) : [];
    var result = $(this);
    $.each(terms, function() {
      result.highlightText(this.toLowerCase(), 'highlighted');
    });
  });
});