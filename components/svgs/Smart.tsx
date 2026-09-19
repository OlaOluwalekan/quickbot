'use client'

import clsx from 'clsx'

const Smart = ({ animate }: { animate: boolean }) => {
  return (
    <div className='inline-flex'>
      <svg
        width={48}
        height={48}
        viewBox='0 0 48 48'
        xmlns='http://www.w3.org/2000/svg'
      >
        <defs>
          <style>
            {`
                .smart-circle {
                  stroke-dasharray: 110;
                  stroke-dashoffset: 110;
                  animation: draw-circle 1s ease-in-out infinite;
                }

                @keyframes draw-circle {
                  0% {
                    stroke-dashoffset: 110;
                  }
                  30% {
                    stroke-dashoffset: 0;
                  }
                  100% {
                    stroke-dashoffset: 0;
                  }
                }

                .smart-path {
                  stroke-dasharray: 50;
                  stroke-dashoffset: 50;
                  animation: draw-path 1s ease-in-out infinite;
                }

                @keyframes draw-path {
                  0% {
                    stroke-dashoffset: 50;
                  }
                  30% {
                    stroke-dashoffset: 50;
                  }
                  60% {
                    stroke-dashoffset: 0;
                  }
                  100% {
                    stroke-dashoffset: 0;
                  }
                }

                .smart-dot {
                  transform: translateY(-5px);
                  opacity: 1;
                  animation: show-dot 1s ease-in-out infinite;
                }

                @keyframes show-dot {
                  0% {
                    transform: translateY(-5px);
                    opacity: 0;
                  }
                  30% {
                    transform: translateY(-5px);
                    opacity: 0;
                  }
                  60% {
                    transform: translateY(-5px);
                    opacity: 0;
                  }
                  80% {
                    transform: translateY(0px);
                    opacity: 1;
                  }
                  100% {
                    transform: translateY(0px);
                    opacity: 1;
                  }
                }
              `}
          </style>
        </defs>
        <circle
          // style='fill:none;stroke:#9370db;stroke-width:1.576;stroke-opacity:1;stroke-dasharray:none'
          id='path2'
          cx='24'
          cy='24'
          r='16.712122'
          fill='transparent'
          stroke='#9370db'
          strokeWidth={3}
          className={clsx(animate && 'smart-circle')}
        />
        <path
          id='circle3'
          d='m 16.19151,20.562483 c 0,-3.983436 2.622042,-7.212648 7.710047,-7.212648 5.088005,0 8.195387,2.269029 7.886823,7.212648 -0.442003,7.081496 -7.660177,4.737774 -7.886823,7.212648 l 0,3.773645'
          fill='transparent'
          stroke='#9370db'
          strokeWidth={3}
          className={clsx(animate && 'smart-path')}
        />
        <circle
          // style='fill:#9370db;fill-opacity:1;stroke:none;stroke-width:1.24016;stroke-dasharray:none;stroke-opacity:1'
          id='path3'
          cx='24'
          cy='34.487514'
          r='1.5'
          fill='#9370db'
          className={clsx(animate && 'smart-dot')}
        />
      </svg>
    </div>
  )
}

export default Smart
