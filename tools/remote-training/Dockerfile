FROM ubuntu:22.04
RUN apt-get update && apt-get install --yes openssh-server && rm -rf /var/lib/apt/lists/*
RUN mkdir /run/sshd && useradd --create-home --home-dir /srv/basecase-training --shell /bin/sh trainer && passwd -d trainer
RUN printf 'PasswordAuthentication no\nPermitRootLogin no\nAllowUsers trainer\n' > /etc/ssh/sshd_config.d/basecase.conf
CMD ["sleep", "infinity"]
