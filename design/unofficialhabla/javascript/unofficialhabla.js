/* 
 Default
 Hab.la - Account Number
*/
wc_init("6955-399305-10-8754");

/*
 Customized
 Hab.la - Custom Configuration
 http://www.hab.la/tutorials/customize.html

 1. Changing the color scheme

  config = new hbl.hwindow.config();

  config.palette['titlebg'] = '#0563bd';
  config.palette['titlebg_highlight'] = '#4598e8';
  config.palette['buttonbg'] = '#0563bd';
  config.palette['buttonhi'] = '#4598e8';
  config.palette['link'] = '#4598e8';
  config.palette['linkhi'] = '#000000';
  config.palette['local'] = '#0563bd';

  wc_init("1111-2222-33-4444", config)
  });

 2.Changing your away message

  wc_init("1111-2222-33-4444", function(r) {
   r.setAwayLink("http://www.mysite.com/contact.html");
  });

  wc_init("1111-2222-33-4444", function(r) {
   r.setOfflineMessage("We're not home. Go away!");
  });

*/
