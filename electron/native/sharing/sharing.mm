#import <AppKit/AppKit.h>
#include <node_api.h>

@interface BasecaseShareDelegate : NSObject <NSSharingServiceDelegate>
@property(nonatomic, weak) NSWindow *window;
@end

@implementation BasecaseShareDelegate
- (NSWindow *)sharingService:(NSSharingService *)service
    sourceWindowForShareItems:(NSArray *)items
          sharingContentScope:(NSSharingContentScope *)scope {
  return self.window;
}
@end

static NSSharingService *activeService;
static BasecaseShareDelegate *activeDelegate;

static NSString *StringArg(napi_env env, napi_value value) {
  size_t length = 0;

  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok) return nil;

  NSMutableData *buffer = [NSMutableData dataWithLength:length + 1];

  napi_get_value_string_utf8(env, value, (char *)buffer.mutableBytes, length + 1, &length);

  return [[NSString alloc] initWithBytes:buffer.bytes length:length encoding:NSUTF8StringEncoding];
}

static NSWindow *WindowArg(napi_env env, napi_value value) {
  bool isBuffer = false;
  void *data = NULL;
  size_t length = 0;

  if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer) return nil;

  napi_get_buffer_info(env, value, &data, &length);

  if (length < sizeof(void *)) return nil;

  NSView *view = (__bridge NSView *)(*(void **)data);

  return view.window;
}

static napi_value JsBool(napi_env env, bool value) {
  napi_value result;

  napi_get_boolean(env, value, &result);

  return result;
}

static napi_value AirDrop(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];

  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);

  NSString *path = argc > 0 ? StringArg(env, argv[0]) : nil;

  if (!path.length) {
    napi_throw_type_error(env, NULL, "airDrop needs a file path");

    return NULL;
  }

  NSArray *items = @[ [NSURL fileURLWithPath:path] ];
  NSSharingService *service = [NSSharingService sharingServiceNamed:NSSharingServiceNameSendViaAirDrop];

  if (!service || ![service canPerformWithItems:items]) return JsBool(env, false);

  BasecaseShareDelegate *delegate = [BasecaseShareDelegate new];

  delegate.window = argc > 1 ? WindowArg(env, argv[1]) : nil;
  service.delegate = delegate;
  activeService = service;
  activeDelegate = delegate;
  [service performWithItems:items];

  return JsBool(env, true);
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value airDrop;

  napi_create_function(env, "airDrop", NAPI_AUTO_LENGTH, AirDrop, NULL, &airDrop);
  napi_set_named_property(env, exports, "airDrop", airDrop);

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
