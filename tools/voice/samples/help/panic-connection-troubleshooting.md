## Troubleshooting connection issues in Transmit and Nova

There are any number of different things that could cause a server connection to fail. If you’re having trouble connecting to your server, here’s what you should check.

### 1. Make sure your login details are correct

It may sound obvious, but double-check to make sure that you have the correct login details. At the bare minimum, you will need the following information in order to connect to your server:

- `Protocol`
- `Server Address` (Typically a domain name such as `server.com` or an IPv4 address)
- `Port number` (Typically `21` for FTP, `22` for SFTP)
- `Username`
- `Password` (and/or SSH Key)

The most commonly used protocols in Transmit and Nova are `FTP`, `SFTP`, `FTP with TLS/SSL`, and `FTP with Implicit SSL`. Make sure you have the correct one selected! Example: selecting `FTP` won’t work if your login requires `SFTP`. Check with your administrator or hosting company to be sure of what you need.

**Note:** Panic is not your web host. We have zero control over your login details. If you need to reset your website password, you will need to contact the hosting company or the person that manages your web server.

If you’re using an SSH key, there are a lot of little details to keep in mind. See our documentation for working with SSH keys for more information.

### 2. Check the Transcript or error messages

Errors and other connection related information get logged in the Transcript. You can view the Transcript by selecting `Transcript` from the `Window` Menu in the menubar. Often times, error messages logged in the transcript will tell you what’s wrong or what setting you need to change. You can find many additional server settings in Settings > Advanced > Advanced Server Settings.

### 3. Disable firewalls or other network filtering software

Aggressive settings enabled in firewalls, apps like Little Snitch, or devices like network routers can sometimes cause issues with server connections. This is especially common with corporate or university networks. If you’re having trouble connecting, try disabling any of these apps or devices you may be running. Power cycling your network equipment may also help.

As a test, try connecting your Mac to a different network. If you’re at home, take your Mac to work/school or vice versa. If one network allows you to connect but another network does not, then you’ve found the issue.

### 4. Try connecting with a different FTP client app

By connecting with a different FTP client that’s not Transmit or Nova, it can tell you a lot of things. Here are some examples:

- If you cannot connect to your server with Transmit/Nova or other FTP clients, then you know that the connection issue is likely due to your server or your login. Should this be the case, there’s not really anything we can do on our end. You will need to check with your server’s administrator.
- If you CAN connect in other FTP clients but NOT in Transmit or Nova, then it’s either a matter of getting your settings correct, or there’s some quirk with your server that our apps aren’t respecting. Email us with a test login (see our note below) and we can generally determine why this is happening.

Note: For security purposes, do not send us the credentials that you yourself use to login! If you send us a login, make sure it’s a newly-created test account. Feel free to lock it down to a single folder if you like.

### 5. If all else fails, contact us

I’ve you’ve gone through all of the steps above, feel free to reach out to us for technical support. Be sure to include a copy of the Transcript from step 2.
