#ifndef ANTI_DETECT_H
#define ANTI_DETECT_H

#include <stdbool.h>
#include <stddef.h>
#include <sys/types.h>

void anti_detect_init(void);

bool anti_detect_should_hide(const char *path);

void anti_detect_scrub_env(void);

#endif
