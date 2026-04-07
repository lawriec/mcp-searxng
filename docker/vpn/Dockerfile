FROM alpine:3.20

RUN apk add --no-cache openvpn curl bash ip6tables iptables \
    && apk add --no-cache --virtual .build-deps gcc musl-dev make git \
    && git clone --depth 1 https://github.com/rofl0r/microsocks.git /tmp/microsocks \
    && cd /tmp/microsocks && make && cp microsocks /usr/local/bin/ \
    && apk del .build-deps && rm -rf /tmp/microsocks

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 1080

ENTRYPOINT ["/entrypoint.sh"]
